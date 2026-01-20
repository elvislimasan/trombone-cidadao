package com.trombonecidadao.app

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.PermissionState
import com.otaliastudios.transcoder.Transcoder
import com.otaliastudios.transcoder.TranscoderListener
import com.otaliastudios.transcoder.strategy.DefaultVideoStrategy
import java.io.File
import java.io.FileOutputStream
import java.io.FileInputStream
import java.io.IOException
import java.util.UUID
import com.trombonecidadao.app.UploadService
import kotlinx.coroutines.*
import kotlin.math.min
import kotlin.math.max
import java.net.HttpURLConnection
import java.net.URL

@CapacitorPlugin(
    name = "VideoProcessor",
    permissions = [
        Permission(
            strings = [Manifest.permission.CAMERA],
            alias = "camera"
        ),
        Permission(
            strings = [Manifest.permission.READ_MEDIA_VIDEO],
            alias = "storage_video"
        ),
        Permission(
            strings = [Manifest.permission.READ_EXTERNAL_STORAGE],
            alias = "storage"
        )
    ]
)
class VideoProcessorPlugin : Plugin() {

    companion object {
        private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        private val uploadJobs = mutableMapOf<String, Job>()

        private var pendingCaptureUri: Uri? = null
        private var pendingCaptureFile: File? = null
        private var captureOptions: JSObject? = null
    }

    override fun load() {
        super.load()
        try {
            UploadService.progressListener = { id, progress, status ->
                val ret = JSObject()
                ret.put("id", id)
                ret.put("progress", progress)
                ret.put("status", status)
                notifyListeners("uploadProgress", ret)
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Error setting up progress listener", e)
        }
    }

    @PluginMethod
    fun uploadVideoInBackground(call: PluginCall) {
        val filePath = call.getString("filePath")
        val uploadUrl = call.getString("uploadUrl")

        if (filePath == null || uploadUrl == null) {
            call.reject("Must provide filePath and uploadUrl")
            return
        }

        val uploadId = UUID.randomUUID().toString()

        val intent = Intent(context, UploadService::class.java).apply {
            putExtra("uploadId", uploadId)
            putExtra("filePath", filePath)
            putExtra("uploadUrl", uploadUrl)
            
            // Pass skipCompression flag
            val skipCompression = call.getBoolean("skipCompression", false) ?: false
            putExtra("skipCompression", skipCompression)

            val headers = call.getObject("headers")
            if (headers != null) {
                val headerMap = HashMap<String, String>()
                val keys = headers.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val value = headers.getString(key)
                    if (value != null) {
                        headerMap[key] = value
                    }
                }
                putExtra("headers", headerMap)
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        val ret = JSObject()
        ret.put("uploadId", uploadId)
        call.resolve(ret)
    }

    @PluginMethod
    fun cancelUpload(call: PluginCall) {
        val uploadId = call.getString("uploadId")
        UploadService.cancelUpload(uploadId)
        call.resolve()
    }

    @PluginMethod
    fun captureVideo(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "permissionCallback")
        } else {
            startVideoCapture(call)
        }
    }

    @PluginMethod
    fun capturePhoto(call: PluginCall) {
        captureOptions = call.data
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "permissionPhotoCallback")
        } else {
            startPhotoCapture(call)
        }
    }

    @PluginMethod
    fun recoverLostPhoto(call: PluginCall) {
        val prefs = context.getSharedPreferences("VideoProcessorPrefs", Context.MODE_PRIVATE)
        val path = prefs.getString("pending_capture_path", null)
        
        if (path != null) {
            val file = File(path)
            if (file.exists()) {
                // Limpar para não recuperar duas vezes
                prefs.edit().remove("pending_capture_path").apply()
                
                val ret = JSObject()
                ret.put("filePath", file.absolutePath)
                ret.put("nativePath", file.absolutePath)
                ret.put("isRecovered", true)
                call.resolve(ret)
                return
            }
        }
        
        call.resolve() // Retorna vazio se nada encontrado
    }

    @PluginMethod
    fun pickVideo(call: PluginCall) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "storage_video" else "storage"
        
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "permissionPickCallback")
        } else {
            startPickVideo(call)
        }
    }
    
    private fun startPickVideo(call: PluginCall) {
        val intent = Intent(Intent.ACTION_PICK, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
        intent.type = "video/*"
        startActivityForResult(call, intent, "handlePickResult")
    }

    @PluginMethod
    fun compressVideo(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath == null) {
            call.reject("Must provide filePath")
            return
        }

        val quality = call.getString("quality") ?: "low"
        val maxSizeMB = call.getInt("maxSizeMB") ?: 50
        
        // Create output file
        val outputDir = File(context.cacheDir, "compressed_videos")
        if (!outputDir.exists()) outputDir.mkdirs()
        val outputFile = File(outputDir, "compressed_${System.currentTimeMillis()}.mp4")

        try {
            val uri = Uri.parse(filePath)
            
            // Adjust bitrate based on quality
            val bitRate = when (quality) {
                "high" -> 4000000L // 4 Mbps
                "medium" -> 2500000L // 2.5 Mbps
                else -> 1000000L // 1 Mbps
            }

            val strategy = DefaultVideoStrategy.Builder()
                .keyFrameInterval(3f)
                .bitRate(bitRate)
                .frameRate(30)
                .build()

            Transcoder.into(outputFile.absolutePath)
                .addDataSource(context, uri)
                .setVideoTrackStrategy(strategy)
                .setListener(object : TranscoderListener {
                    override fun onTranscodeProgress(progress: Double) {
                        val ret = JSObject()
                        ret.put("progress", (progress * 100).toInt())
                        notifyListeners("videoProgress", ret)
                    }

                    override fun onTranscodeCompleted(successCode: Int) {
                        val ret = JSObject()
                        ret.put("outputPath", outputFile.absolutePath)
                        ret.put("compressedSize", outputFile.length())
                        call.resolve(ret)
                    }

                    override fun onTranscodeCanceled() {
                        call.reject("Compression canceled")
                    }

                    override fun onTranscodeFailed(exception: Throwable) {
                        call.reject("Compression failed: ${exception.message}")
                    }
                })
                .transcode()


        } catch (e: Exception) {
            Log.e("VideoProcessor", "Error starting compression", e)
            call.reject("Error starting compression: ${e.message}")
        }
    }

    @PluginMethod
    fun compressImage(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath == null) {
            call.reject("Must provide filePath")
            return
        }

        val maxSizeMB = call.getInt("maxSizeMB") ?: 10
        val maxWidth = call.getInt("maxWidth") ?: 1280
        val maxHeight = call.getInt("maxHeight") ?: 960
        val quality = call.getString("quality") ?: "medium"
        val format = call.getString("format") ?: "webp"

        coroutineScope.launch {
            try {
                val actualPath = convertCapacitorPath(filePath)
                val compressedPath = compressCapturedImage(
                    actualPath,
                    maxSizeMB,
                    maxWidth,
                    maxHeight,
                    quality,
                    format
                )
                
                val originalFile = File(actualPath)
                val compressedFile = File(compressedPath)
                
                val ret = JSObject()
                ret.put("outputPath", compressedPath)
                ret.put("originalSize", originalFile.length())
                ret.put("compressedSize", compressedFile.length())
                val ratio = if (originalFile.length() > 0) {
                     compressedFile.length().toFloat() / originalFile.length().toFloat()
                } else 0f
                ret.put("compressionRatio", ratio)
                
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Error compressing image", e)
                call.reject("Error compressing image: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun uploadFile(call: PluginCall) {
        val filePath = call.getString("filePath")
        val uploadUrl = call.getString("uploadUrl")
        
        if (filePath == null || uploadUrl == null) {
            call.reject("Must provide filePath and uploadUrl")
            return
        }
        
        val headers = call.getObject("headers") ?: JSObject()
        val uploadId = UUID.randomUUID().toString()
        
        coroutineScope.launch {
            try {
                val actualPath = convertCapacitorPath(filePath)
                val file = File(actualPath)
                
                if (!file.exists()) {
                    call.reject("File not found")
                    return@launch
                }
                
                uploadFileInternal(file, uploadUrl, headers, uploadId)
                
                val ret = JSObject()
                ret.put("success", true)
                ret.put("uploadId", uploadId)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Error uploading file", e)
                call.reject("Error uploading file: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getImageMetadata(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath is required")
                return
            }
            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            if (!file.exists()) {
                call.reject("File not found")
                return
            }
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(actualPath, opts)
            val res = JSObject().apply {
                put("width", opts.outWidth)
                put("height", opts.outHeight)
                put("size", file.length())
            }
            call.resolve(res)
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Error getting image metadata", e)
            call.reject("Error getting metadata: ${e.message}")
        }
    }

    @PluginMethod
    fun getVideoMetadata(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath == null) {
            call.reject("Must provide filePath")
            return
        }

        try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, Uri.parse(filePath))
            
            val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val widthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
            val heightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
            
            val duration = durationStr?.toLongOrNull() ?: 0L
            val width = widthStr?.toIntOrNull() ?: 0
            val height = heightStr?.toIntOrNull() ?: 0
            
            // Try to get size
            var size = 0L
            try {
                if (filePath.startsWith("content://")) {
                     context.contentResolver.query(Uri.parse(filePath), null, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                            if (sizeIndex != -1) {
                                size = cursor.getLong(sizeIndex)
                            }
                        }
                    }
                } else {
                    val file = File(filePath)
                    if (file.exists()) {
                        size = file.length()
                    }
                }
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Error getting size", e)
            }

            val ret = JSObject()
            ret.put("duration", duration / 1000.0) // seconds
            ret.put("width", width)
            ret.put("height", height)
            ret.put("size", size)
            
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Error reading metadata: ${e.message}")
        }
    }

    @PluginMethod
    fun getVideoThumbnail(call: PluginCall) {
        val filePath = call.getString("filePath")
        if (filePath == null) {
            call.reject("Must provide filePath")
            return
        }

        try {
            val uri = Uri.parse(filePath)
            
            // OTIMIZAÇÃO: Usar loadThumbnail no Android Q+ (muito mais eficiente para 8K)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val size = android.util.Size(320, 240)
                    val bitmap = context.contentResolver.loadThumbnail(uri, size, null)
                    
                    saveBitmapAndResolve(bitmap, call)
                    return
                } catch (e: Exception) {
                    Log.w("VideoProcessor", "loadThumbnail failed, falling back to MetadataRetriever", e)
                }
            }
            
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(context, uri)
            
            // Get frame at 1 second or 0
            // Tentar capturar frame com catch de OOM para vídeos 8K
            var bitmap: Bitmap? = null
            try {
                bitmap = retriever.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) 
                         ?: retriever.getFrameAtTime(0)
            } catch (oom: OutOfMemoryError) {
                Log.e("VideoProcessor", "OOM getting frame", oom)
            }
            
            if (bitmap != null) {
                // Redimensionar imediatamente se for muito grande (8K -> Thumbnail)
                if (bitmap.width > 640 || bitmap.height > 640) {
                    val scale = 640f / Math.max(bitmap.width, bitmap.height)
                    val w = (bitmap.width * scale).toInt()
                    val h = (bitmap.height * scale).toInt()
                    val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
                    if (scaled != bitmap) {
                        bitmap.recycle()
                        bitmap = scaled
                    }
                }
                
                saveBitmapAndResolve(bitmap!!, call)
            } else {
                call.reject("Could not retrieve thumbnail")
            }
            retriever.release()
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Error generating thumbnail", e)
            call.reject("Error generating thumbnail: ${e.message}")
        }
    }
    
    private fun saveBitmapAndResolve(bitmap: Bitmap, call: PluginCall) {
        try {
            val cacheDir = File(context.cacheDir, "thumbnails")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val file = File(cacheDir, "thumb_${System.currentTimeMillis()}.jpg")
            
            FileOutputStream(file).use { out ->
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, out)
            }
            
            val ret = JSObject()
            ret.put("imagePath", file.absolutePath)
            call.resolve(ret)
        } catch (e: Exception) {
             call.reject("Error saving thumbnail: ${e.message}")
        }
    }

    private fun startVideoCapture(call: PluginCall) {
        val intent = Intent(MediaStore.ACTION_VIDEO_CAPTURE)
        try {
            val fileName = "video_${System.currentTimeMillis()}.mp4"
            val file = File(context.cacheDir, fileName)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            pendingCaptureUri = uri
            pendingCaptureFile = file
            
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            // Add ClipData for Android 11+ permission persistence
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                intent.clipData = ClipData.newRawUri("", uri)
            }
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            
            startActivityForResult(call, intent, "handleCaptureResult")
        } catch (e: Exception) {
            call.reject("Cannot open camera: ${e.message}")
        }
    }

    private fun startPhotoCapture(call: PluginCall) {
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        try {
            val fileName = "photo_${System.currentTimeMillis()}.jpg"
            val file = File(context.cacheDir, fileName)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            pendingCaptureUri = uri
            pendingCaptureFile = file
            
            // Persistir o caminho do arquivo para sobreviver à morte do processo
            val prefs = context.getSharedPreferences("VideoProcessorPrefs", Context.MODE_PRIVATE)
            prefs.edit().putString("pending_capture_path", file.absolutePath).apply()
            
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
             // Add ClipData for Android 11+ permission persistence
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                intent.clipData = ClipData.newRawUri("", uri)
            }
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            
            startKeepAliveService()
            startActivityForResult(call, intent, "handlePhotoCaptureResult")
        } catch (e: Exception) {
            call.reject("Cannot open camera: ${e.message}")
        }
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            startVideoCapture(call)
        } else {
            call.reject("Permission denied")
        }
    }

    @PermissionCallback
    private fun permissionPhotoCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            startPhotoCapture(call)
        } else {
            call.reject("Permission denied")
        }
    }

    @PermissionCallback
    private fun permissionPickCallback(call: PluginCall) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "storage_video" else "storage"
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            startPickVideo(call)
        } else {
            call.reject("Permission denied")
        }
    }

    @ActivityCallback
    private fun handlePickResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val uri = result.data?.data
            if (uri != null) {
                // Offload to background thread to avoid ANR on large files
                Thread {
                    try {
                        // OTIMIZAÇÃO: Não copiar o arquivo imediatamente!
                        // Vídeos 8K podem ter gigabytes e copiar trava o app ou demora muito.
                        // Vamos usar o URI diretamente (content://) e deixar o UploadService
                        // ou o Transcoder lerem diretamente da fonte.
                        
                        val ret = JSObject()
                        ret.put("filePath", uri.toString())
                        ret.put("nativePath", uri.toString())
                        ret.put("isNative", true)
                        
                        // Get size and name
                        var size = 0L
                        var name = "video_${System.currentTimeMillis()}.mp4"
                        
                        try {
                            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                                if (cursor.moveToFirst()) {
                                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                                    
                                    if (sizeIndex != -1) size = cursor.getLong(sizeIndex)
                                    if (nameIndex != -1) name = cursor.getString(nameIndex)
                                }
                            }
                        } catch (e: Exception) {
                            Log.e("VideoProcessor", "Error getting file details", e)
                        }
                        
                        ret.put("size", size)
                        ret.put("name", name)
                        
                        // Get duration
                        try {
                            val retriever = MediaMetadataRetriever()
                            retriever.setDataSource(context, uri)
                            val durationStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                            val duration = durationStr?.toLongOrNull() ?: 0L
                            ret.put("duration", duration / 1000.0) // seconds
                            retriever.release()
                        } catch (e: Exception) {
                            Log.e("VideoProcessor", "Error getting duration", e)
                            ret.put("duration", 0)
                        }
                        
                        call.resolve(ret)
                    } catch (e: Exception) {
                        Log.e("VideoProcessor", "Error processing picked video", e)
                        call.reject("Error processing selected video: ${e.message}")
                    }
                }.start()
            } else {
                call.reject("No video selected")
            }
        } else {
            call.reject("Selection canceled")
        }
    }

    @ActivityCallback
    private fun handleCaptureResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode == Activity.RESULT_OK) {
             // pendingCaptureFile should be set
             if (pendingCaptureFile != null && pendingCaptureFile!!.exists()) {
                 val ret = JSObject()
                 ret.put("filePath", pendingCaptureFile!!.absolutePath)
                 ret.put("nativePath", pendingCaptureFile!!.absolutePath)
                 ret.put("isNative", true)
                 call.resolve(ret)
             } else if (pendingCaptureUri != null) {
                 val ret = JSObject()
                 ret.put("filePath", pendingCaptureUri.toString())
                 call.resolve(ret)
             } else {
                 // Fallback: try to get from data
                 val uri = result.data?.data
                 if (uri != null) {
                     val ret = JSObject()
                     ret.put("filePath", uri.toString())
                     call.resolve(ret)
                 } else {
                     call.reject("Error capturing video")
                 }
             }
        } else {
            call.reject("Capture canceled")
        }
    }

    @ActivityCallback
    private fun handlePhotoCaptureResult(call: PluginCall?, result: ActivityResult) {
        stopKeepAliveService()
        if (call == null) return

        if (result.resultCode == Activity.RESULT_OK) {
            var file = pendingCaptureFile
            
            // Tentar recuperar de SharedPreferences se a variável em memória foi perdida
            if (file == null) {
                val prefs = context.getSharedPreferences("VideoProcessorPrefs", Context.MODE_PRIVATE)
                val path = prefs.getString("pending_capture_path", null)
                if (path != null) {
                    file = File(path)
                }
            }
            
            // Limpar SharedPreferences
            context.getSharedPreferences("VideoProcessorPrefs", Context.MODE_PRIVATE)
                .edit().remove("pending_capture_path").apply()

            if (file != null && file.exists()) {
                // OTIMIZAÇÃO CRÍTICA: Não processar a imagem aqui!
                // Processar imagens de 50MP+ (S24FE) causa OOM e crasha o app.
                // Apenas retornamos o caminho do arquivo. O processamento (resize/compress)
                // deve ser feito sob demanda via compressImage().
                
                val ret = JSObject()
                ret.put("filePath", file.absolutePath)
                ret.put("nativePath", file.absolutePath)
                ret.put("isNative", true)
                call.resolve(ret)
            } else {
                call.reject("Error capturing photo: File not found")
            }
        } else {
            call.reject("Capture canceled")
        }
    }

    private fun convertCapacitorPath(path: String): String {
        if (path.startsWith("content://")) {
            return copyContentUriToTempFile(path)
        }
        return when {
            path.startsWith("file://") -> path.removePrefix("file://")
            path.startsWith("capacitor://") -> {
                val relativePath = path.removePrefix("capacitor://localhost/")
                File(context.filesDir, relativePath).absolutePath
            }
            else -> path
        }
    }

    private fun copyContentUriToTempFile(uriString: String): String {
        try {
            val uri = android.net.Uri.parse(uriString)
            val contentResolver = context.contentResolver
            val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
            val extension = if (mimeType.contains("image")) ".jpg" else if (mimeType.contains("video")) ".mp4" else ".tmp"
            
            val tempFile = File.createTempFile("temp_content_", extension, context.cacheDir)
            
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            return tempFile.absolutePath
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao copiar content URI: $uriString", e)
            return uriString
        }
    }

    private fun compressCapturedImage(
        actualPath: String,
        maxSizeMB: Int,
        maxWidth: Int,
        maxHeight: Int,
        qualityPreset: String = "low",
        format: String = "webp"
    ): String {
        Log.d("VideoProcessor", "Iniciando compressão segura: $actualPath")
        val inputFile = File(actualPath)
        
        val outputPath = if (format.lowercase() == "webp") {
            "${actualPath}.converted.webp"
        } else {
            "${actualPath}.compressed.jpg"
        }

        var currentQuality = when (qualityPreset) {
            "high" -> 100
            "medium" -> 90
            else -> 85
        }

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(actualPath, bounds)
        
        val originalWidth = bounds.outWidth
        val originalHeight = bounds.outHeight
        
        if (originalWidth <= 0 || originalHeight <= 0) {
            Log.e("VideoProcessor", "Falha ao ler dimensões da imagem: $actualPath")
            return actualPath
        }
        
        var rotationDegrees = 0
        try {
            val exif = androidx.exifinterface.media.ExifInterface(actualPath)
            val orientation = exif.getAttributeInt(
                androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
                androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
            )
            
            rotationDegrees = when (orientation) {
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        } catch (e: Exception) {
            Log.w("VideoProcessor", "Erro ao ler EXIF: ${e.message}")
        }
        
        val rotatedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) originalHeight else originalWidth
        val rotatedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) originalWidth else originalHeight

        val ABSOLUTE_MAX_DIMENSION = 4096
        
        var targetWidth = rotatedWidth
        var targetHeight = rotatedHeight
        
        if (targetWidth > ABSOLUTE_MAX_DIMENSION || targetHeight > ABSOLUTE_MAX_DIMENSION) {
            val ratio = min(
                ABSOLUTE_MAX_DIMENSION.toFloat() / targetWidth,
                ABSOLUTE_MAX_DIMENSION.toFloat() / targetHeight
            )
            targetWidth = (targetWidth * ratio).toInt()
            targetHeight = (targetHeight * ratio).toInt()
        }
        
        val reqMaxWidth = min(maxWidth, ABSOLUTE_MAX_DIMENSION)
        val reqMaxHeight = min(maxHeight, ABSOLUTE_MAX_DIMENSION)
        
        if (targetWidth > reqMaxWidth || targetHeight > reqMaxHeight) {
            val ratio = min(
                reqMaxWidth.toFloat() / targetWidth,
                reqMaxHeight.toFloat() / targetHeight
            )
            targetWidth = (targetWidth * ratio).toInt()
            targetHeight = (targetHeight * ratio).toInt()
        }
        
        targetWidth = max(targetWidth, 2)
        targetHeight = max(targetHeight, 2)
        if (targetWidth % 2 != 0) targetWidth += 1
        if (targetHeight % 2 != 0) targetHeight += 1

        Log.d("VideoProcessor", "Resize: ${originalWidth}x${originalHeight} -> ${targetWidth}x${targetHeight} (Rot: $rotationDegrees)")

        var inSample = 1
        val widthRatio = originalWidth / targetWidth
        val heightRatio = originalHeight / targetHeight
        val sampleRatio = min(widthRatio, heightRatio)
        
        while (inSample * 2 <= sampleRatio) {
            inSample *= 2
        }
        
        val SAFE_BITMAP_MEMORY = 16 * 1024 * 1024
        
        val totalPixels = originalWidth.toLong() * originalHeight.toLong()
        if (totalPixels > 12 * 1000 * 1000) {
            inSample = max(inSample, 2)
            if (totalPixels > 40 * 1000 * 1000) {
                inSample = max(inSample, 4)
            }
        }
        
        while (true) {
            val estimatedW = originalWidth / inSample
            val estimatedH = originalHeight / inSample
            
            val estimatedBytes = estimatedW.toLong() * estimatedH.toLong() * 4
            val exceedsMemory = estimatedBytes > SAFE_BITMAP_MEMORY
            
            val currentW = estimatedW
            val currentH = estimatedH
            val exceedsResolution = currentW > (targetWidth * 1.5) || currentH > (targetHeight * 1.5)
            
            if (exceedsMemory || exceedsResolution) {
                inSample *= 2
                Log.w("VideoProcessor", "Aumentando inSample para $inSample (Mem: ${estimatedBytes/1024/1024}MB)")
            } else {
                break
            }
        }

        Log.d("VideoProcessor", "Usando inSampleSize final: $inSample")

        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = false
            inPreferredConfig = Bitmap.Config.RGB_565 
            inSampleSize = inSample
            inDither = true 
            inPurgeable = true 
            inInputShareable = true
        }
        
        var bitmap: Bitmap? = null
        var tries = 0
        
        while (tries < 3 && bitmap == null) {
            try {
                if (tries > 0) System.gc()
                bitmap = BitmapFactory.decodeFile(actualPath, options)
            } catch (e: OutOfMemoryError) {
                Log.e("VideoProcessor", "OOM ao decodificar imagem (tentativa $tries). Aumentando inSampleSize.")
                options.inSampleSize *= 2
                tries++
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Erro ao decodificar imagem: ${e.message}")
                tries++
            }
        }

        if (bitmap == null) {
            Log.e("VideoProcessor", "Falha fatal: Não foi possível carregar a imagem após retentativas.")
            return actualPath
        }
        
        try {
            val rotatedBitmap = if (rotationDegrees != 0) {
                val matrix = Matrix()
                matrix.postRotate(rotationDegrees.toFloat())
                
                val currentW = bitmap.width
                val currentH = bitmap.height
                val finalW = if (rotationDegrees == 90 || rotationDegrees == 270) targetHeight else targetWidth
                val finalH = if (rotationDegrees == 90 || rotationDegrees == 270) targetWidth else targetHeight
                
                val scaleX = finalW.toFloat() / currentW
                val scaleY = finalH.toFloat() / currentH
                val scale = min(scaleX, scaleY)
                
                if (scale < 1.0f) {
                    matrix.postScale(scale, scale)
                }
                
                Bitmap.createBitmap(
                    bitmap, 0, 0, bitmap.width, bitmap.height,
                    matrix, true
                )
            } else {
                val currentW = bitmap.width
                val currentH = bitmap.height
                
                if (currentW > targetWidth || currentH > targetHeight) {
                    val scaleX = targetWidth.toFloat() / currentW
                    val scaleY = targetHeight.toFloat() / currentH
                    val scale = min(scaleX, scaleY)
                    
                    val matrix = Matrix()
                    matrix.postScale(scale, scale)
                    Bitmap.createBitmap(
                        bitmap, 0, 0, currentW, currentH,
                        matrix, true
                    )
                } else {
                    bitmap
                }
            }
            
            if (rotatedBitmap != bitmap) {
                bitmap.recycle()
                bitmap = rotatedBitmap
            }
            
            val compressFormat = if (format.lowercase() == "webp") {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                    Bitmap.CompressFormat.WEBP_LOSSY
                } else {
                    @Suppress("DEPRECATION")
                    Bitmap.CompressFormat.WEBP
                }
            } else {
                Bitmap.CompressFormat.JPEG
            }
            
            var success = false
            var quality = currentQuality
            var outputFile = File(outputPath)
            
            while (!success && quality >= 50) {
                try {
                    FileOutputStream(outputFile).use { out ->
                        bitmap.compress(compressFormat, quality, out)
                    }
                    val resultSize = outputFile.length()
                    if (resultSize > maxSizeMB * 1024 * 1024) {
                        quality -= 10
                    } else {
                        success = true
                    }
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao salvar imagem comprimida", e)
                    quality -= 10
                }
            }
            
            bitmap.recycle()
            return outputPath
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao processar imagem", e)
            bitmap.recycle()
            return actualPath
        }
    }
    
    private suspend fun uploadFileInternal(
        file: File,
        uploadUrl: String,
        headers: JSObject,
        uploadId: String
    ) = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        var fileInputStream: FileInputStream? = null
        
        try {
            val url = URL(uploadUrl)
            connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "PUT"
            connection.doOutput = true
            
            var contentType = "application/octet-stream"
            
            val iterator = headers.keys()
            while (iterator.hasNext()) {
                val key = iterator.next()
                val value = headers.getString(key)
                if (value != null) {
                    connection.setRequestProperty(key, value)
                    if (key.equals("Content-Type", ignoreCase = true)) {
                        contentType = value
                    }
                }
            }
            
            val fileLength = file.length()
            connection.setRequestProperty("Content-Length", fileLength.toString())
            
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
                connection.setFixedLengthStreamingMode(fileLength)
            } else {
                connection.setFixedLengthStreamingMode(fileLength.toInt())
            }
            
            connection.connectTimeout = 60000
            connection.readTimeout = 60000
            
            fileInputStream = FileInputStream(file)
            connection.outputStream.use { output ->
                fileInputStream.copyTo(output, bufferSize = 65536)
            }
            
            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                Log.d("VideoProcessor", "Upload concluído: $uploadId")
            } else {
                val errorStream = connection.errorStream
                val errorMessage = errorStream?.bufferedReader()?.use { it.readText() } ?: "Erro desconhecido"
                Log.e("VideoProcessor", "Erro no upload ($responseCode): $errorMessage")
                throw IOException("Falha no upload (HTTP $responseCode): $errorMessage")
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro no upload", e)
            throw e
        } finally {
            fileInputStream?.close()
            connection?.disconnect()
        }
    }

    private fun startKeepAliveService() {
        try {
            val intent = Intent(context, KeepAliveService::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Falha ao iniciar KeepAliveService", e)
        }
    }

    private fun stopKeepAliveService() {
        try {
            val intent = Intent(context, KeepAliveService::class.java)
            context.stopService(intent)
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Falha ao parar KeepAliveService", e)
        }
    }
}
