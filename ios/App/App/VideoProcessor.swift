import Foundation
import Capacitor
import AVFoundation
import UIKit
import ImageIO

// Implementação nativa iOS do plugin VideoProcessor.
// Espelha o comportamento do plugin Android (VideoProcessorPlugin.kt + UploadService.kt),
// emitindo os mesmos eventos ("uploadProgress" / "videoProgress") e os mesmos formatos
// de retorno consumidos pelo JS (src/contexts/UploadContext.jsx, useBackgroundUpload, etc).
@objc(VideoProcessorPlugin)
public class VideoProcessorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VideoProcessorPlugin"
    public let jsName = "VideoProcessor"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "captureVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVideoMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVideoThumbnail", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capturePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverLostPhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getImageMetadata", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compressVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compressImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadVideoInBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUploadProgress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateImageThumbnail", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareToInstagramStory", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - Estado de upload

    private struct UploadState {
        var progress: Int = 0
        var status: String = "pending"
        var task: URLSessionUploadTask?
        var responseCode: Int = 0
        var tempFile: String?
    }

    private let stateQueue = DispatchQueue(label: "com.trombonecidadao.videoprocessor.state")
    private var uploads: [String: UploadState] = [:]
    private var taskToUpload: [Int: String] = [:]

    private lazy var uploadSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 600
        config.timeoutIntervalForResource = 3600
        config.waitsForConnectivity = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    // Calls pendentes de seleção/captura de mídia (UIImagePicker)
    private var pendingPickerCall: CAPPluginCall?
    private var pendingPickerMode: String = "" // "photo" | "video" | "pickVideo"

    // MARK: - Helpers

    private func resolveFilePath(_ path: String) -> String {
        if path.hasPrefix("file://") {
            return String(path.dropFirst("file://".count)).removingPercentEncoding ?? String(path.dropFirst("file://".count))
        }
        if let range = path.range(of: "_capacitor_file_") {
            let tail = String(path[range.upperBound...])
            return tail.removingPercentEncoding ?? tail
        }
        return path
    }

    private func cachesDir(_ sub: String) -> URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent(sub, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func fileSize(_ path: String) -> Int64 {
        let attrs = try? FileManager.default.attributesOfItem(atPath: path)
        return (attrs?[.size] as? Int64) ?? 0
    }

    // MARK: - compressImage

    @objc func compressImage(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("Must provide filePath")
            return
        }
        let maxWidth = CGFloat(call.getInt("maxWidth") ?? 1280)
        let maxHeight = CGFloat(call.getInt("maxHeight") ?? 960)
        let maxSizeMB = Double(call.getInt("maxSizeMB") ?? 10)
        let quality = call.getString("quality") ?? "medium"
        let format = call.getString("format") ?? "jpeg"

        DispatchQueue.global(qos: .userInitiated).async {
            let actualPath = self.resolveFilePath(rawPath)
            let url = URL(fileURLWithPath: actualPath)
            let originalSize = self.fileSize(actualPath)

            let maxDimension = max(maxWidth, maxHeight)
            guard let image = self.downsample(url: url, maxPixelSize: maxDimension) else {
                call.reject("Falha ao carregar imagem")
                return
            }

            var compressionQuality: CGFloat
            switch quality {
            case "high": compressionQuality = 0.92
            case "low": compressionQuality = 0.7
            default: compressionQuality = 0.85
            }

            let ext = (format.lowercased() == "png") ? "png" : "jpg"
            let outputURL = self.cachesDir("compressed_images")
                .appendingPathComponent("img_\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)")

            let maxBytes = Int(maxSizeMB * 1024 * 1024)
            var data: Data?

            if format.lowercased() == "png" {
                data = image.pngData()
            } else {
                data = image.jpegData(compressionQuality: compressionQuality)
                while let d = data, d.count > maxBytes, compressionQuality > 0.5 {
                    compressionQuality -= 0.1
                    data = image.jpegData(compressionQuality: compressionQuality)
                }
            }

            guard let outData = data else {
                call.reject("Falha ao codificar imagem")
                return
            }

            do {
                try outData.write(to: outputURL, options: .atomic)
            } catch {
                call.reject("Falha ao salvar imagem: \(error.localizedDescription)")
                return
            }

            let compressedSize = Int64(outData.count)
            let ratio = originalSize > 0 ? Double(compressedSize) / Double(originalSize) : 0
            call.resolve([
                "outputPath": outputURL.path,
                "originalSize": originalSize,
                "compressedSize": compressedSize,
                "compressionRatio": ratio
            ])
        }
    }

    private func downsample(url: URL, maxPixelSize: CGFloat) -> UIImage? {
        let srcOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let src = CGImageSourceCreateWithURL(url as CFURL, srcOptions) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    // MARK: - getImageMetadata

    @objc func getImageMetadata(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("filePath is required")
            return
        }
        let actualPath = resolveFilePath(rawPath)
        let url = URL(fileURLWithPath: actualPath)
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else {
            call.reject("Could not read image metadata")
            return
        }
        let width = props[kCGImagePropertyPixelWidth] as? Int ?? 0
        let height = props[kCGImagePropertyPixelHeight] as? Int ?? 0
        call.resolve([
            "width": width,
            "height": height,
            "size": fileSize(actualPath)
        ])
    }

    // MARK: - getVideoMetadata

    @objc func getVideoMetadata(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("Must provide filePath")
            return
        }
        let actualPath = resolveFilePath(rawPath)
        let asset = AVURLAsset(url: URL(fileURLWithPath: actualPath))
        let duration = CMTimeGetSeconds(asset.duration)
        var width = 0
        var height = 0
        if let track = asset.tracks(withMediaType: .video).first {
            let size = track.naturalSize.applying(track.preferredTransform)
            width = Int(abs(size.width))
            height = Int(abs(size.height))
        }
        call.resolve([
            "duration": duration.isFinite ? duration : 0,
            "width": width,
            "height": height,
            "size": fileSize(actualPath)
        ])
    }

    // MARK: - getVideoThumbnail

    @objc func getVideoThumbnail(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("Must provide filePath")
            return
        }
        let actualPath = resolveFilePath(rawPath)
        let atMs = call.getInt("atMs") ?? 1000

        DispatchQueue.global(qos: .userInitiated).async {
            let asset = AVURLAsset(url: URL(fileURLWithPath: actualPath))
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = CGSize(width: 640, height: 640)
            let time = CMTime(value: CMTimeValue(atMs), timescale: 1000)
            do {
                let cg = try generator.copyCGImage(at: time, actualTime: nil)
                let image = UIImage(cgImage: cg)
                guard let data = image.jpegData(compressionQuality: 0.7) else {
                    call.reject("Could not encode thumbnail")
                    return
                }
                let outURL = self.cachesDir("thumbnails")
                    .appendingPathComponent("thumb_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
                try data.write(to: outURL, options: .atomic)
                call.resolve(["imagePath": outURL.path])
            } catch {
                call.reject("Error generating thumbnail: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - compressVideo

    @objc func compressVideo(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("Must provide filePath")
            return
        }
        let actualPath = resolveFilePath(rawPath)
        let quality = call.getString("quality") ?? "low"
        let originalSize = fileSize(actualPath)

        let preset: String
        switch quality {
        case "high": preset = AVAssetExportPreset1920x1080
        case "medium": preset = AVAssetExportPreset1280x720
        default: preset = AVAssetExportPresetMediumQuality
        }

        let asset = AVURLAsset(url: URL(fileURLWithPath: actualPath))
        guard let export = AVAssetExportSession(asset: asset, presetName: preset) else {
            call.reject("Não foi possível criar sessão de exportação")
            return
        }
        let outURL = cachesDir("compressed_videos")
            .appendingPathComponent("compressed_\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
        export.outputURL = outURL
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true

        let progressTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
        progressTimer.schedule(deadline: .now(), repeating: 0.3)
        progressTimer.setEventHandler { [weak self] in
            self?.notifyListeners("videoProgress", data: ["progress": Int(export.progress * 100)])
        }
        progressTimer.resume()

        export.exportAsynchronously {
            progressTimer.cancel()
            switch export.status {
            case .completed:
                let compressedSize = self.fileSize(outURL.path)
                let ratio = originalSize > 0 ? Double(compressedSize) / Double(originalSize) : 0
                call.resolve([
                    "outputPath": outURL.path,
                    "originalSize": originalSize,
                    "compressedSize": compressedSize,
                    "compressionRatio": ratio
                ])
            case .cancelled:
                call.reject("Compression canceled")
            default:
                call.reject("Compression failed: \(export.error?.localizedDescription ?? "unknown")")
            }
        }
    }

    // MARK: - uploadVideoInBackground

    @objc func uploadVideoInBackground(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath"),
              let uploadUrl = call.getString("uploadUrl") else {
            call.reject("Must provide filePath and uploadUrl")
            return
        }
        let headers = call.getObject("headers") ?? [:]
        let skipCompression = call.getBool("skipCompression") ?? false
        let uploadId = UUID().uuidString

        stateQueue.sync {
            uploads[uploadId] = UploadState(progress: 0, status: "pending", task: nil, responseCode: 0, tempFile: nil)
        }

        // Resolve imediatamente (fire-and-forget), como no Android.
        call.resolve(["uploadId": uploadId])

        DispatchQueue.global(qos: .utility).async {
            let actualPath = self.resolveFilePath(rawPath)
            var fileToUpload = actualPath
            var tempFile: String?

            if !skipCompression {
                self.notify(uploadId, 0, "compressing")
                // Best-effort: se a compressão falhar (preset incompatível, etc.),
                // enviamos o arquivo original em vez de falhar o upload por completo.
                if let compressed = self.compressVideoSync(actualPath) {
                    fileToUpload = compressed
                    tempFile = compressed
                }
            }

            guard FileManager.default.fileExists(atPath: fileToUpload) else {
                self.notify(uploadId, 0, "error")
                return
            }

            self.startUpload(uploadId: uploadId, filePath: fileToUpload, uploadUrl: uploadUrl, headers: headers, tempFile: tempFile)
        }
    }

    private func compressVideoSync(_ path: String) -> String? {
        let asset = AVURLAsset(url: URL(fileURLWithPath: path))
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720) else {
            return nil
        }
        let outURL = cachesDir("compressed_videos")
            .appendingPathComponent("upload_\(UUID().uuidString).mp4")
        export.outputURL = outURL
        export.outputFileType = .mp4
        export.shouldOptimizeForNetworkUse = true

        let semaphore = DispatchSemaphore(value: 0)
        var success = false
        export.exportAsynchronously {
            success = export.status == .completed
            semaphore.signal()
        }
        semaphore.wait()
        return success ? outURL.path : nil
    }

    private func startUpload(uploadId: String, filePath: String, uploadUrl: String, headers: JSObject, tempFile: String?) {
        guard let url = URL(string: uploadUrl) else {
            notify(uploadId, 0, "error")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        var contentType = "application/octet-stream"
        for (key, value) in headers {
            if let v = value as? String {
                request.setValue(v, forHTTPHeaderField: key)
                if key.lowercased() == "content-type" { contentType = v }
            }
        }
        if request.value(forHTTPHeaderField: "Content-Type") == nil {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }

        let fileURL = URL(fileURLWithPath: filePath)
        let task = uploadSession.uploadTask(with: request, fromFile: fileURL)

        stateQueue.sync {
            var state = uploads[uploadId] ?? UploadState()
            state.task = task
            state.tempFile = tempFile
            uploads[uploadId] = state
            taskToUpload[task.taskIdentifier] = uploadId
        }

        notify(uploadId, 0, "uploading")
        task.resume()
    }

    // MARK: - cancelUpload / getUploadProgress

    @objc func cancelUpload(_ call: CAPPluginCall) {
        let uploadId = call.getString("uploadId")
        if let id = uploadId {
            stateQueue.sync {
                uploads[id]?.task?.cancel()
            }
            notify(id, 0, "cancelled")
        }
        call.resolve()
    }

    @objc func getUploadProgress(_ call: CAPPluginCall) {
        guard let uploadId = call.getString("uploadId") else {
            call.reject("Must provide uploadId")
            return
        }
        var progress = 0
        var status = "unknown"
        stateQueue.sync {
            if let state = uploads[uploadId] {
                progress = state.progress
                status = state.status
            }
        }
        call.resolve(["progress": progress, "status": status])
    }

    // MARK: - uploadFile (bloqueante)

    @objc func uploadFile(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath"),
              let uploadUrl = call.getString("uploadUrl"),
              let url = URL(string: uploadUrl) else {
            call.reject("Must provide filePath and uploadUrl")
            return
        }
        let headers = call.getObject("headers") ?? [:]
        let uploadId = UUID().uuidString
        let actualPath = resolveFilePath(rawPath)

        guard FileManager.default.fileExists(atPath: actualPath) else {
            call.reject("File not found")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        for (key, value) in headers {
            if let v = value as? String { request.setValue(v, forHTTPHeaderField: key) }
        }

        let task = URLSession.shared.uploadTask(with: request, fromFile: URL(fileURLWithPath: actualPath)) { _, response, error in
            if let error = error {
                call.reject("Error uploading file: \(error.localizedDescription)")
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (200...299).contains(code) {
                call.resolve(["success": true, "uploadId": uploadId])
            } else {
                call.reject("Upload failed: HTTP \(code)")
            }
        }
        task.resume()
    }

    // MARK: - recoverLostPhoto (iOS não sofre do mesmo OOM/morte de processo)

    @objc func recoverLostPhoto(_ call: CAPPluginCall) {
        call.resolve([:])
    }

    // MARK: - Captura / seleção de mídia

    @objc func captureVideo(_ call: CAPPluginCall) {
        let maxDuration = call.getInt("maxDurationSec") ?? 600
        presentPicker(call: call, mode: "video", sourceType: .camera, maxDuration: maxDuration)
    }

    @objc func capturePhoto(_ call: CAPPluginCall) {
        presentPicker(call: call, mode: "photo", sourceType: .camera, maxDuration: 0)
    }

    @objc func pickVideo(_ call: CAPPluginCall) {
        presentPicker(call: call, mode: "pickVideo", sourceType: .photoLibrary, maxDuration: 0)
    }

    @objc func generateImageThumbnail(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("Must provide filePath")
            return
        }
        let maxDimension = CGFloat(max(call.getInt("maxWidth") ?? 320, call.getInt("maxHeight") ?? 320))
        DispatchQueue.global(qos: .userInitiated).async {
            let url = URL(fileURLWithPath: self.resolveFilePath(rawPath))
            guard let image = self.downsample(url: url, maxPixelSize: maxDimension),
                  let data = image.jpegData(compressionQuality: 0.7) else {
                call.reject("thumbnail failed")
                return
            }
            let outURL = self.cachesDir("thumbnails")
                .appendingPathComponent("thumb_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
            do {
                try data.write(to: outURL, options: .atomic)
                call.resolve(["thumbnailPath": outURL.path])
            } catch {
                call.reject("thumbnail failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - shareToInstagramStory

    /// Compartilha um vídeo ou imagem diretamente no story do Instagram via URL scheme.
    ///
    /// O sticker de link (contentURL) só é renderizado pelo Instagram se a conta do
    /// usuário tiver permissão de link em story — regra da Meta, fora do controle do app.
    /// Quando a conta não tem, a mídia entra normalmente e o link é ignorado em silêncio.
    /// `linkAttached` indica apenas que enviamos o parâmetro, não que ele apareceu.
    @objc func shareToInstagramStory(_ call: CAPPluginCall) {
        guard let rawPath = call.getString("filePath") else {
            call.reject("filePath é obrigatório")
            return
        }
        guard let appId = call.getString("facebookAppId"), !appId.isEmpty else {
            call.reject("facebookAppId é obrigatório para o Instagram aceitar o asset")
            return
        }

        let actualPath = resolveFilePath(rawPath)
        guard FileManager.default.fileExists(atPath: actualPath) else {
            call.reject("Arquivo não encontrado: \(actualPath)")
            return
        }

        guard let mediaData = FileManager.default.contents(atPath: actualPath) else {
            call.reject("Não foi possível ler a mídia")
            return
        }

        // O Instagram usa chaves de pasteboard distintas para os dois fundos;
        // enviar imagem na chave de vídeo faz o story abrir vazio.
        let mediaType = call.getString("mediaType") ?? "video"
        let backgroundKey = mediaType == "image"
            ? "com.instagram.sharedSticker.backgroundImage"
            : "com.instagram.sharedSticker.backgroundVideo"

        let contentUrl = call.getString("contentUrl")

        DispatchQueue.main.async {
            // O scheme precisa estar em LSApplicationQueriesSchemes no Info.plist,
            // senão canOpenURL retorna false mesmo com o Instagram instalado.
            guard let urlScheme = URL(string: "instagram-stories://share?source_application=\(appId)"),
                  UIApplication.shared.canOpenURL(urlScheme) else {
                call.reject("INSTAGRAM_NOT_INSTALLED", "Instagram não está instalado")
                return
            }

            var item: [String: Any] = [
                backgroundKey: mediaData,
                "com.instagram.sharedSticker.appID": appId
            ]
            if let contentUrl = contentUrl, !contentUrl.isEmpty {
                item["com.instagram.sharedSticker.contentURL"] = contentUrl
            }

            // O pasteboard é consumido pelo Instagram na abertura; a expiração
            // evita que a mídia fique acessível a outros apps depois disso.
            UIPasteboard.general.setItems(
                [item],
                options: [.expirationDate: Date().addingTimeInterval(60 * 5)]
            )

            UIApplication.shared.open(urlScheme, options: [:]) { opened in
                if opened {
                    call.resolve([
                        "shared": true,
                        "linkAttached": !(contentUrl ?? "").isEmpty
                    ])
                } else {
                    call.reject("Não foi possível abrir o Instagram")
                }
            }
        }
    }

    private func presentPicker(call: CAPPluginCall, mode: String, sourceType: UIImagePickerController.SourceType, maxDuration: Int) {
        if !UIImagePickerController.isSourceTypeAvailable(sourceType) {
            call.reject("Fonte de mídia indisponível")
            return
        }
        DispatchQueue.main.async {
            let picker = UIImagePickerController()
            picker.delegate = self
            picker.sourceType = sourceType

            // IMPORTANTE: atribuir mediaTypes com um tipo não disponível para a fonte
            // faz o UIKit lançar exceção e DERRUBAR o app ("No available types for source").
            // Por isso usamos a string exata reportada por availableMediaTypes(for:).
            let available = UIImagePickerController.availableMediaTypes(for: sourceType) ?? []

            if mode == "photo" {
                guard let imageType = available.first(where: { $0 == "public.image" || $0.lowercased().contains("image") }) else {
                    call.reject("Câmera de foto indisponível neste dispositivo")
                    return
                }
                picker.mediaTypes = [imageType]
                if sourceType == .camera { picker.cameraCaptureMode = .photo }
            } else {
                guard let movieType = available.first(where: { $0 == "public.movie" || $0.lowercased().contains("movie") }) else {
                    call.reject("Gravação/seleção de vídeo indisponível neste dispositivo")
                    return
                }
                picker.mediaTypes = [movieType]
                if mode == "video" && sourceType == .camera {
                    picker.cameraCaptureMode = .video
                    if maxDuration > 0 { picker.videoMaximumDuration = TimeInterval(maxDuration) }
                }
            }

            self.pendingPickerCall = call
            self.pendingPickerMode = mode
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }
}

// MARK: - UIImagePickerControllerDelegate

extension VideoProcessorPlugin: UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        pendingPickerCall?.reject("Capture canceled")
        pendingPickerCall = nil
    }

    public func imagePickerController(_ picker: UIImagePickerController,
                                      didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let call = pendingPickerCall
        let mode = pendingPickerMode
        pendingPickerCall = nil
        picker.dismiss(animated: true)

        guard let call = call else { return }

        if mode == "photo" {
            guard let image = info[.originalImage] as? UIImage,
                  let data = image.jpegData(compressionQuality: 0.95) else {
                call.reject("Error capturing photo")
                return
            }
            let outURL = cachesDir("captures")
                .appendingPathComponent("photo_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
            do {
                try data.write(to: outURL, options: .atomic)
                call.resolve(["filePath": outURL.path, "nativePath": outURL.path, "isNative": true])
            } catch {
                call.reject("Error saving photo: \(error.localizedDescription)")
            }
            return
        }

        // Vídeo (captura ou seleção)
        guard let mediaURL = info[.mediaURL] as? URL else {
            call.reject("No video selected")
            return
        }
        let name = mediaURL.lastPathComponent
        let outURL = cachesDir("captures")
            .appendingPathComponent("video_\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
        do {
            if FileManager.default.fileExists(atPath: outURL.path) {
                try FileManager.default.removeItem(at: outURL)
            }
            try FileManager.default.copyItem(at: mediaURL, to: outURL)
        } catch {
            call.reject("Error processing video: \(error.localizedDescription)")
            return
        }

        if mode == "pickVideo" {
            let asset = AVURLAsset(url: outURL)
            let duration = CMTimeGetSeconds(asset.duration)
            call.resolve([
                "filePath": outURL.path,
                "nativePath": outURL.path,
                "isNative": true,
                "name": name,
                "size": fileSize(outURL.path),
                "duration": duration.isFinite ? duration : 0
            ])
        } else {
            call.resolve(["filePath": outURL.path, "nativePath": outURL.path, "isNative": true])
        }
    }
}

// MARK: - URLSession delegate (progresso e conclusão do upload)

extension VideoProcessorPlugin: URLSessionDataDelegate {
    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           didSendBodyData bytesSent: Int64,
                           totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        let progress = Int(Double(totalBytesSent) / Double(totalBytesExpectedToSend) * 100)
        var uploadId: String?
        stateQueue.sync {
            uploadId = taskToUpload[task.taskIdentifier]
            if let id = uploadId { uploads[id]?.progress = progress }
        }
        if let id = uploadId { notify(id, progress, "uploading", store: false) }
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse) {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        stateQueue.sync {
            if let id = taskToUpload[dataTask.taskIdentifier] { uploads[id]?.responseCode = code }
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        var uploadId: String?
        var responseCode = 0
        var tempFile: String?
        stateQueue.sync {
            uploadId = taskToUpload[task.taskIdentifier]
            if let id = uploadId {
                responseCode = uploads[id]?.responseCode ?? 0
                tempFile = uploads[id]?.tempFile
            }
            taskToUpload.removeValue(forKey: task.taskIdentifier)
        }
        guard let id = uploadId else { return }

        if let tempFile = tempFile {
            try? FileManager.default.removeItem(atPath: tempFile)
        }

        if let error = error {
            if (error as NSError).code == NSURLErrorCancelled {
                notify(id, 0, "cancelled")
            } else {
                notify(id, 0, "error")
            }
        } else if (200...299).contains(responseCode) {
            notify(id, 100, "completed")
        } else {
            notify(id, 0, "error_upload_failed_\(responseCode)")
        }

        stateQueue.sync { uploads.removeValue(forKey: id) }
    }

    private func notify(_ id: String, _ progress: Int, _ status: String, store: Bool = true) {
        if store {
            stateQueue.sync {
                if uploads[id] != nil {
                    uploads[id]?.progress = progress
                    uploads[id]?.status = status
                }
            }
        }
        notifyListeners("uploadProgress", data: ["id": id, "progress": progress, "status": status])
    }
}
