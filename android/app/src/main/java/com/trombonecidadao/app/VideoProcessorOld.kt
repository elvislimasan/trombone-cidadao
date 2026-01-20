package com.trombonecidadao.app

import android.media.MediaMetadataRetriever
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaExtractor
import android.media.MediaMuxer
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.graphics.BitmapFactory
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.core.content.FileProvider
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.PermissionCallback
import android.Manifest
import androidx.activity.result.ActivityResult
import java.io.File
import java.io.FileInputStream
import kotlin.math.min
import java.io.FileOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.*
import kotlin.math.max
import com.otaliastudios.transcoder.Transcoder
import com.otaliastudios.transcoder.TranscoderListener
import com.otaliastudios.transcoder.strategy.DefaultVideoStrategy
import com.otaliastudios.transcoder.strategy.DefaultAudioStrategy
import com.otaliastudios.transcoder.resize.FractionResizer

@CapacitorPlugin(
    name = "VideoProcessorOld",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ]
)
class VideoProcessorOld : Plugin() {
    
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val uploadJobs = mutableMapOf<String, Job>()
    private var pendingCaptureFile: File? = null
    
    @PluginMethod
    fun captureVideo(call: PluginCall) {
        try {
            if (getPermissionState("camera") != PermissionState.GRANTED) {
                requestPermissionForAlias("camera", call, "captureVideoPermissionCallback")
                return
            }
            startVideoCapture(call)
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao verificar/perdir permissão de câmera (vídeo)", e)
            call.reject("Erro ao iniciar captura de vídeo: ${e.message}")
        }
    }

    @PermissionCallback
    fun captureVideoPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            startVideoCapture(call)
        } else {
            call.reject("Permissão de câmera negada")
        }
    }

    private fun startVideoCapture(call: PluginCall) {
        try {
            val activity = activity ?: run {
                call.reject("Atividade indisponível")
                return
            }
            val maxDuration = call.getInt("maxDurationSec")
            val lowQuality = call.getBoolean("lowQuality") ?: true
            
            Log.d("VideoProcessor", "Iniciando captura de vídeo: maxDuration=${maxDuration ?: "unlimited"}, lowQuality=$lowQuality")
            
            val intent = Intent(MediaStore.ACTION_VIDEO_CAPTURE)
            
            // Configurar qualidade (0 = Low/MMS, 1 = High)
            // Se lowQuality for true, forçamos 0 para economizar espaço em gravações longas
            // Mas se o usuário quiser alta qualidade, usamos 1.
            // Para arquivos de 3-5GB, provavelmente é High Quality.
            // O padrão do Android é High (1).
            if (lowQuality) {
                intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0)
            } else {
                intent.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1)
            }

            if (maxDuration != null && maxDuration > 0) {
                intent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, maxDuration)
            }
            
            // Removido EXTRA_SIZE_LIMIT para evitar que a câmera mostre barra de limite/progresso.
            // O limite será o armazenamento disponível do dispositivo.
            
            val cacheDir = activity.cacheDir
            // Padronização de nomes: report_video_TIMESTAMP.mp4
            val timeStamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
            val fileName = "report_video_${timeStamp}_"
            val outFile = File.createTempFile(fileName, ".mp4", cacheDir)
            val authority = activity.packageName + ".fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, outFile)
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            pendingCaptureFile = outFile
            
            try {
                val prefs = activity.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                prefs.edit().putString("pending_video_capture_path", outFile.absolutePath).apply()
            } catch (e: Exception) {
                Log.w("VideoProcessor", "Falha ao salvar estado pendente de vídeo", e)
            }

            startActivityForResult(call, intent, "captureVideoResult")
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao iniciar captura de vídeo", e)
            call.reject("Erro ao iniciar captura de vídeo: ${e.message}")
        }
    }

    @PluginMethod
    fun capturePhoto(call: PluginCall) {
        try {
            if (getPermissionState("camera") != PermissionState.GRANTED) {
                requestPermissionForAlias("camera", call, "capturePhotoPermissionCallback")
                return
            }
            startPhotoCapture(call)
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao verificar/perdir permissão de câmera (foto)", e)
            call.reject("Erro ao iniciar captura de foto: ${e.message}")
        }
    }

    @PluginMethod
    fun pickVideo(call: PluginCall) {
        try {
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                type = "video/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            }
            startActivityForResult(call, intent, "pickVideoResult")
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao abrir galeria de vídeos", e)
            call.reject("Erro ao abrir galeria: ${e.message}")
        }
    }

    @ActivityCallback
    fun pickVideoResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK) {
            val uri = result.data?.data
            if (uri != null) {
                try {
                    val tempPath = copyContentUriToTempFile(uri.toString())
                    
                    val file = File(tempPath)
                    val ret = JSObject().apply {
                        put("filePath", tempPath)
                        put("name", file.name)
                        put("size", file.length())
                        
                        try {
                            val mmr = MediaMetadataRetriever()
                            mmr.setDataSource(tempPath)
                            val duration = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0
                            put("duration", duration / 1000.0)
                            mmr.release()
                        } catch (e: Exception) {}
                    }
                    call.resolve(ret)
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao processar vídeo selecionado", e)
                    call.reject("Erro ao processar vídeo: ${e.message}")
                }
            } else {
                call.reject("Nenhum vídeo selecionado")
            }
        } else {
            call.reject("Seleção cancelada")
        }
    }

    @PermissionCallback
    fun capturePhotoPermissionCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            startPhotoCapture(call)
        } else {
            call.reject("Permissão de câmera negada")
        }
    }

    private fun startPhotoCapture(call: PluginCall) {
        try {
            val activity = activity ?: run {
                call.reject("Atividade indisponível")
                return
            }
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            intent.putExtra("android.intent.extras.CAMERA_FACING", 0)
            intent.putExtra("android.intent.extra.CAMERA_FACING", 0)
            intent.putExtra("android.intent.extra.USE_FRONT_CAMERA", false)
            
            val storageDir = activity.getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES) ?: activity.filesDir
            // Padronização de nomes: report_image_TIMESTAMP.jpg
            val timeStamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
            val fileName = "report_image_${timeStamp}_"
            val outFile = File.createTempFile(fileName, ".jpg", storageDir)
            
            val authority = activity.packageName + ".fileprovider"
            val uri = FileProvider.getUriForFile(activity, authority, outFile)
            intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            
            pendingCaptureFile = outFile
            try {
                val prefs = activity.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                prefs.edit().putString("pending_capture_path", outFile.absolutePath).apply()
            } catch (e: Exception) {
                Log.w("VideoProcessor", "Falha ao salvar estado pendente", e)
            }
            
            startKeepAliveService()
            startActivityForResult(call, intent, "capturePhotoResult")
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao iniciar captura de foto", e)
            call.reject("Erro ao iniciar captura de foto: ${e.message}")
        }
    }

    @ActivityCallback
    fun capturePhotoResult(call: PluginCall, result: ActivityResult) {
        stopKeepAliveService()

        coroutineScope.launch(Dispatchers.Default) {
            try {
                delay(300)
                
                val code = result.resultCode
                var file = pendingCaptureFile
                if (file == null) {
                    val activity = activity
                    if (activity != null) {
                        try {
                            val prefs = activity.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                            val path = prefs.getString("pending_capture_path", null)
                            if (path != null) {
                                file = File(path)
                            }
                        } catch (e: Exception) {
                            Log.w("VideoProcessor", "Erro ao recuperar path do SharedPreferences", e)
                        }
                    }
                }
                
                pendingCaptureFile = null
                try {
                    activity?.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                        ?.edit()?.remove("pending_capture_path")?.apply()
                } catch (e: Exception) {}
                
                if (code == Activity.RESULT_OK && file != null && file.exists()) {
                    if (file.length() == 0L) {
                         call.reject("Erro: Arquivo de foto vazio.")
                         return@launch
                    }

                    var outputPath = file.absolutePath
                    
                    notifyListeners("captureSuccess", JSObject().apply {
                        put("originalPath", outputPath)
                    })

                    try {
                        System.gc()
                        
                        val targetMaxWidth = call.getInt("maxWidth") ?: 2048
                        val targetMaxHeight = call.getInt("maxHeight") ?: 2048
                        val maxSizeMB = call.getInt("maxSizeMB") ?: 10
                        val quality = call.getString("quality") ?: "medium"
                        
                        outputPath = compressCapturedImage(file.absolutePath, maxSizeMB, targetMaxWidth, targetMaxHeight, quality, "jpeg")
                    } catch (t: Throwable) {
                        Log.e("VideoProcessor", "Falha grave/OOM ao converter imagem capturada.", t)
                        System.gc()
                        outputPath = file.absolutePath
                        Log.w("VideoProcessor", "Retornando imagem original devido a erro na compressão")
                    }

                    val res = JSObject().apply {
                        put("filePath", outputPath)
                        put("warning", if (outputPath == file.absolutePath) "original_returned" else null)
                    }
                    call.resolve(res)
                    
                    notifyListeners("imageProcessed", res)
                    
                } else {
                    call.reject("Captura cancelada ou arquivo indisponível")
                }
            } catch (t: Throwable) {
                Log.e("VideoProcessor", "Erro fatal no resultado de captura de foto", t)
                call.reject("Erro ao finalizar captura de foto: ${t.message}")
            }
        }
    }

    @PluginMethod
    fun getImageMetadata(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            if (!file.exists()) {
                call.reject("Arquivo não encontrado")
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
            Log.e("VideoProcessor", "Erro ao obter metadados da imagem", e)
            call.reject("Erro ao obter metadados: ${e.message}")
        }
    }

    @ActivityCallback
    fun captureVideoResult(call: PluginCall, result: ActivityResult) {
        try {
            val code = result.resultCode
            
            var file = pendingCaptureFile
            if (file == null) {
                val activity = activity
                if (activity != null) {
                    try {
                        val prefs = activity.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                        val path = prefs.getString("pending_video_capture_path", null)
                        if (path != null) {
                            file = File(path)
                        }
                    } catch (e: Exception) {
                        Log.w("VideoProcessor", "Erro ao recuperar path de vídeo do SharedPreferences", e)
                    }
                }
            }
            
            pendingCaptureFile = null
            try {
                activity?.getSharedPreferences("VideoProcessorPlugin", Activity.MODE_PRIVATE)
                    ?.edit()?.remove("pending_video_capture_path")?.apply()
            } catch (e: Exception) {}

            if (code == Activity.RESULT_OK && file != null && file.exists()) {
                if (file.length() == 0L) {
                     call.reject("Erro: Arquivo de vídeo vazio. A câmera pode não ter salvo corretamente.")
                     return
                }

                val maxSize = 512L * 1024L * 1024L
                if (file.length() > maxSize) {
                    Log.w("VideoProcessor", "Vídeo excedeu 512MB ligeiramente: ${file.length()}")
                }
                
                val res = JSObject().apply {
                    put("filePath", file.absolutePath)
                    put("size", file.length())
                }
                call.resolve(res)
            } else {
                call.reject("Captura cancelada ou arquivo indisponível")
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro no resultado de captura", e)
            call.reject("Erro ao finalizar captura: ${e.message}")
        }
    }

    @PluginMethod
    fun getVideoMetadata(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            
            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            
            if (!file.exists()) {
                call.reject("Arquivo não encontrado: $actualPath")
                return
            }
            
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(actualPath)
                
                val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
                val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
                val bitrate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()
                
                val metadata = JSObject().apply {
                    put("duration", duration / 1000.0)
                    put("width", width)
                    put("height", height)
                    put("size", file.length())
                    bitrate?.let { put("bitrate", it) }
                }
                
                call.resolve(metadata)
            } finally {
                retriever.release()
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao obter metadados", e)
            call.reject("Erro ao obter metadados: ${e.message}")
        }
    }

    @PluginMethod
    fun getVideoThumbnail(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            val atMs = call.getInt("atMs") ?: 0
            val maxWidth = call.getInt("maxWidth") ?: 320
            val maxHeight = call.getInt("maxHeight") ?: 240

            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            if (!file.exists()) {
                call.reject("Arquivo não encontrado")
                return
            }

            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(actualPath)
                var bitmap = retriever.getFrameAtTime(atMs.toLong() * 1000) ?: run {
                    call.reject("Falha ao obter frame do vídeo")
                    return
                }

                val width = bitmap.width
                val height = bitmap.height
                var targetW = width
                var targetH = height
                if (width > maxWidth || height > maxHeight) {
                    val ratio = kotlin.math.min(maxWidth.toFloat() / width, maxHeight.toFloat() / height)
                    targetW = (width * ratio).toInt()
                    targetH = (height * ratio).toInt()
                }
                if (targetW != width || targetH != height) {
                    bitmap = Bitmap.createScaledBitmap(bitmap, targetW, targetH, true)
                }

                // Padronização: report_thumb_TIMESTAMP.jpg
                val timeStamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
                val fileName = "report_thumb_${timeStamp}_"
                val outFile = File.createTempFile(fileName, ".jpg", context.cacheDir)
                
                FileOutputStream(outFile).use { out ->
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
                }
                bitmap.recycle()

                val res = JSObject().apply {
                    put("imagePath", outFile.absolutePath)
                }
                call.resolve(res)
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Erro ao gerar thumbnail", e)
                call.reject("Erro ao gerar thumbnail: ${e.message}")
            } finally {
                retriever.release()
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro em getVideoThumbnail", e)
            call.reject("Erro ao obter thumbnail: ${e.message}")
        }
    }
    
    @PluginMethod
    fun generateImageThumbnail(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            val maxWidth = call.getInt("maxWidth") ?: 512
            val maxHeight = call.getInt("maxHeight") ?: 512
            val quality = call.getInt("quality") ?: 70

            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            if (!file.exists()) {
                call.reject("Arquivo não encontrado")
                return
            }

            coroutineScope.launch {
                try {
                    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeFile(actualPath, options)
                    
                    val originalWidth = options.outWidth
                    val originalHeight = options.outHeight
                    
                    if (originalWidth <= 0 || originalHeight <= 0) {
                         call.reject("Falha ao ler dimensões da imagem")
                         return@launch
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
                        Log.w("VideoProcessor", "Erro ao ler EXIF no thumbnail: ${e.message}")
                    }
                    
                    val rotatedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) originalHeight else originalWidth
                    val rotatedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) originalWidth else originalHeight
                    
                    var inSample = 1
                    
                    if (rotatedWidth > maxWidth || rotatedHeight > maxHeight) {
                        val ratio = min(rotatedWidth.toFloat() / maxWidth, rotatedHeight.toFloat() / maxHeight)
                        while (inSample * 2 <= ratio) {
                            inSample *= 2
                        }
                    }
                    
                    val SAFE_BITMAP_MEMORY = 10 * 1024 * 1024
                    while (true) {
                        val estimatedW = originalWidth / inSample
                        val estimatedH = originalHeight / inSample
                        val estimatedBytes = estimatedW.toLong() * estimatedH.toLong() * 2
                        
                        if (estimatedBytes > SAFE_BITMAP_MEMORY) {
                            inSample *= 2
                            Log.w("VideoProcessor", "Thumbnail: Aumentando inSample para $inSample (Memória)")
                        } else {
                            break
                        }
                    }

                    val decodeOptions = BitmapFactory.Options().apply {
                        inJustDecodeBounds = false
                        inSampleSize = inSample
                        inPreferredConfig = Bitmap.Config.RGB_565
                        inDither = true
                    }
                    
                    var bitmap = BitmapFactory.decodeFile(actualPath, decodeOptions) ?: run {
                         call.reject("Falha ao decodificar imagem para thumbnail")
                         return@launch
                    }
                    
                    try {
                        val matrix = Matrix()
                        if (rotationDegrees != 0) {
                            matrix.postRotate(rotationDegrees.toFloat())
                        }
                        
                        val currentW = bitmap.width
                        val currentH = bitmap.height
                        
                        val realCurrentW = if (rotationDegrees == 90 || rotationDegrees == 270) currentH else currentW
                        val realCurrentH = if (rotationDegrees == 90 || rotationDegrees == 270) currentW else currentH
                        
                        if (realCurrentW > maxWidth || realCurrentH > maxHeight) {
                             val scale = min(maxWidth.toFloat() / realCurrentW, maxHeight.toFloat() / realCurrentH)
                             matrix.postScale(scale, scale)
                        }
                        
                        val finalBitmap = Bitmap.createBitmap(
                            bitmap, 0, 0, bitmap.width, bitmap.height,
                            matrix, true
                        )
                        
                        if (finalBitmap != bitmap) {
                            bitmap.recycle()
                            bitmap = finalBitmap
                        }
                        
                        val thumbFile = File.createTempFile("thumb_img_", ".jpg", context.cacheDir)
                        FileOutputStream(thumbFile).use { out ->
                            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
                        }
                        
                        val res = JSObject().apply {
                            put("thumbnailPath", thumbFile.absolutePath)
                        }
                        call.resolve(res)
                        
                    } finally {
                        bitmap.recycle()
                        System.gc()
                    }
                    
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao gerar thumbnail de imagem", e)
                    call.reject("Erro ao gerar thumbnail: ${e.message}")
                }
            }
        } catch (e: Exception) {
            call.reject("Erro geral: ${e.message}")
        }
    }

    @PluginMethod
    fun compressVideo(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            
            val maxSizeMB = call.getInt("maxSizeMB") ?: 15 
            val targetQuality = call.getString("quality") ?: "medium"
            val maxWidth = call.getInt("maxWidth") ?: 1280
            val maxHeight = call.getInt("maxHeight") ?: 1280
            
            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            
            if (!file.exists()) {
                call.reject("Arquivo não encontrado")
                return
            }
            
            val originalSize = file.length()
            
            coroutineScope.launch {
                try {
                    val compressedPath = compressVideoFile(
                        actualPath, 
                        maxSizeMB, 
                        targetQuality,
                        maxWidth,
                        maxHeight
                    )
                    
                    val compressedFile = File(compressedPath)
                    val compressedSize = compressedFile.length()
                    val compressionRatio = ((originalSize - compressedSize) * 100.0) / originalSize
                    
                    val result = JSObject().apply {
                        put("outputPath", compressedPath)
                        put("originalSize", originalSize)
                        put("compressedSize", compressedSize)
                        put("compressionRatio", compressionRatio)
                        put("message", "Vídeo comprimido com sucesso")
                    }
                    
                    call.resolve(result)
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao comprimir vídeo", e)
                    call.reject("Erro ao comprimir vídeo: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao comprimir vídeo", e)
            call.reject("Erro ao comprimir vídeo: ${e.message}")
        }
    }

    @PluginMethod
    fun compressImage(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            val maxSizeMB = call.getInt("maxSizeMB") ?: 10
            val maxWidth = call.getInt("maxWidth") ?: 1280
            val maxHeight = call.getInt("maxHeight") ?: 960
            val qualityPreset = call.getString("quality") ?: "low"
            val format = call.getString("format") ?: "webp"

            val actualPath = convertCapacitorPath(filePath)
            val inputFile = File(actualPath)
            if (!inputFile.exists()) {
                call.reject("Arquivo não encontrado")
                return
            }

            val originalSize = inputFile.length()
            val originalSizeMB = originalSize / (1024.0 * 1024.0)

            val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(actualPath, options)
            val width = options.outWidth
            val height = options.outHeight
            
            val needsResize = width > maxWidth || height > maxHeight

            if (originalSizeMB <= maxSizeMB && !needsResize) {
                val result = JSObject().apply {
                    put("outputPath", filePath)
                    put("originalSize", originalSize)
                    put("compressedSize", originalSize)
                    put("compressionRatio", 0.0)
                }
                call.resolve(result)
                return
            }

            coroutineScope.launch {
                try {
                    val outputPath = compressCapturedImage(actualPath, maxSizeMB, maxWidth, maxHeight, qualityPreset, format)

                    val outFile = File(outputPath)
                    val compressedSize = outFile.length()
                    val result = JSObject().apply {
                        put("outputPath", outputPath)
                        put("originalSize", originalSize)
                        put("compressedSize", compressedSize)
                        put("compressionRatio", ((originalSize - compressedSize) * 100.0) / originalSize)
                    }

                    call.resolve(result)
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao comprimir imagem", e)
                    call.reject("Erro ao comprimir imagem: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao comprimir imagem", e)
            call.reject("Erro ao comprimir imagem: ${e.message}")
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
        
        // Padronização: se o arquivo de entrada já começa com "report_", mantém o padrão
        // Senão, força o prefixo se estivermos criando um arquivo novo
        // Mas como aqui estamos apenas adicionando sufixo, se o arquivo original já tiver o nome certo, ok.
        // O `actualPath` vem do `startPhotoCapture` que já gera "report_image_TIMESTAMP".
        
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
                        bitmap!!.compress(compressFormat, quality, out)
                    }
                    success = true
                    
                    val resultSize = outputFile.length()
                    val maxSizeBytes = maxSizeMB * 1024 * 1024
                    
                    if (resultSize > maxSizeBytes) {
                        quality = max(50, quality - 10)
                        success = false
                        Log.d("VideoProcessor", "Arquivo muito grande (${resultSize/1024}KB). Reduzindo qualidade para $quality")
                    }
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro ao salvar imagem: ${e.message}")
                    quality -= 10
                    if (quality < 50) break
                }
            }
            
            if (!success) {
                Log.e("VideoProcessor", "Falha ao comprimir imagem mesmo após redução de qualidade")
                return actualPath
            }
            
            Log.d("VideoProcessor", "Processamento concluído: $outputPath (Qualidade final: $quality%)")
            return outputPath
            
        } finally {
            bitmap?.recycle()
            System.gc()
        }
    }
    
    @PluginMethod
    fun uploadFile(call: PluginCall) {
        val filePath = call.getString("filePath") ?: run {
            call.reject("filePath é obrigatório")
            return
        }
        val uploadUrl = call.getString("uploadUrl") ?: run {
            call.reject("uploadUrl é obrigatório")
            return
        }
        val headers = call.getObject("headers") ?: JSObject()
        
        val actualPath = convertCapacitorPath(filePath)
        val file = File(actualPath)
        
        if (!file.exists()) {
            call.reject("Arquivo não encontrado")
            return
        }

        val uploadId = "upload_${System.currentTimeMillis()}"

        coroutineScope.launch {
            try {
                uploadFile(file, uploadUrl, headers, uploadId)
                val res = JSObject().apply {
                    put("success", true)
                    put("uploadId", uploadId)
                }
                call.resolve(res)
            } catch (e: Exception) {
                Log.e("VideoProcessor", "Erro no upload bloqueante", e)
                call.reject("Erro no upload: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun uploadVideoInBackground(call: PluginCall) {
        try {
            val filePath = call.getString("filePath") ?: run {
                call.reject("filePath é obrigatório")
                return
            }
            val uploadUrl = call.getString("uploadUrl") ?: run {
                call.reject("uploadUrl é obrigatório")
                return
            }
            val headers = call.getObject("headers") ?: JSObject()
            
            val actualPath = convertCapacitorPath(filePath)
            val file = File(actualPath)
            
            if (!file.exists()) {
                call.reject("Arquivo não encontrado")
                return
            }
            
            val uploadId = "upload_${System.currentTimeMillis()}"
            
            val job = coroutineScope.launch {
                try {
                    uploadFile(file, uploadUrl, headers, uploadId)
                } catch (e: Exception) {
                    Log.e("VideoProcessor", "Erro no upload", e)
                }
            }
            
            uploadJobs[uploadId] = job
            
            val result = JSObject().apply {
                put("uploadId", uploadId)
            }
            
            call.resolve(result)
        } catch (e: Exception) {
            Log.e("VideoProcessor", "Erro ao iniciar upload", e)
            call.reject("Erro ao iniciar upload: ${e.message}")
        }
    }
    
    @PluginMethod
    fun getUploadProgress(call: PluginCall) {
        val uploadId = call.getString("uploadId") ?: run {
            call.reject("uploadId é obrigatório")
            return
        }
        
        val result = JSObject().apply {
            put("progress", 50)
            put("status", "uploading")
        }
        
        call.resolve(result)
    }
    
    @PluginMethod
    fun cancelUpload(call: PluginCall) {
        val uploadId = call.getString("uploadId") ?: run {
            call.reject("uploadId é obrigatório")
            return
        }
        
        uploadJobs[uploadId]?.cancel()
        uploadJobs.remove(uploadId)
        
        call.resolve()
    }
    
    private suspend fun compressVideoFile(
        inputPath: String,
        maxSizeMB: Int,
        quality: String,
        maxWidth: Int,
        maxHeight: Int
    ): String = withContext(Dispatchers.IO) {
        val inputFile = File(inputPath)
        val outputPath = "${inputPath}.compressed.mp4"
        val outputFile = File(outputPath)
        
        if (!inputFile.exists()) {
            throw IOException("Arquivo de entrada não encontrado: $inputPath")
        }
        
        val originalSize = inputFile.length()
        val originalSizeMB = originalSize / (1024.0 * 1024.0)
        
        if (originalSizeMB > 500) {
            Log.w("VideoProcessor", "Vídeo grande (${originalSizeMB}MB) detectado. Ativando modo seguro.")
            System.gc()
            try { Thread.sleep(200) } catch (e: Exception) {}
        }
        
        val availableSpace = inputFile.parentFile?.usableSpace ?: 0
        
        // Ajuste de verificação de espaço para arquivos grandes
        // Para arquivos grandes (>500MB), ser menos conservador: exigir apenas espaço para o output comprimido estimado + folga
        // O output comprimido (HD/safe_hd) geralmente é < 20% do original de alta qualidade.
        val requiredSpace = if (originalSize > 500 * 1024 * 1024) {
             (originalSize * 0.5).toLong() + (100 * 1024 * 1024) // 50% do original + 100MB
        } else {
             originalSize * 2 // 2x para arquivos pequenos (segurança)
        }
        
        if (availableSpace < requiredSpace) {
             Log.w("VideoProcessor", "Espaço em disco baixo: Disp: ${availableSpace/1024/1024}MB, Req estimado: ${requiredSpace/1024/1024}MB.")
             // Se tiver menos de 300MB livres absolutos, rejeitar para evitar corromper sistema
             if (availableSpace < 300 * 1024 * 1024) {
                 throw IOException("Espaço insuficiente no dispositivo para processar o vídeo (Mínimo 300MB livres necessários)")
             }
        }
        
        try {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(inputPath)
            } catch (e: Exception) {
                throw IOException("Falha ao ler metadados do vídeo: ${e.message}")
            }
            
            val originalWidth = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 1920
            val originalHeight = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 1080
            val originalFrameRate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toFloatOrNull() ?: 30f
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val originalBitrate = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toIntOrNull()
            
            retriever.release()
            
            val is4K = originalWidth >= 3840 && originalHeight >= 2160
            val is8K = originalWidth >= 7680 && originalHeight >= 4320
            val willDownscaleToHD = maxWidth < 3840 && maxHeight < 2160
            val effectiveIs4K = is4K && !willDownscaleToHD
            val effectiveIs8K = is8K && !willDownscaleToHD
            val isUltraHD = effectiveIs4K || effectiveIs8K

            val isSmallEnough = originalSizeMB <= maxSizeMB
            val isResolutionLow = originalWidth <= maxWidth && originalHeight <= maxHeight
            
            if (isSmallEnough && isResolutionLow && !isUltraHD) {
                 Log.d("VideoProcessor", "Vídeo já está otimizado (Tamanho: ${originalSizeMB}MB, Res: ${originalWidth}x${originalHeight})")
                 return@withContext inputPath
            }
            
            var effectiveQuality = quality
            
            if (isUltraHD || originalSizeMB > 300) {
                Log.w("VideoProcessor", "Vídeo pesado detectado (UltraHD ou >300MB). Otimizando para 720p/HD.")
                effectiveQuality = "safe_hd" 
            }
            
            System.gc()
            
            val (videoBitrate, audioBitrate, frameRate) = when (effectiveQuality) {
                "low" -> Triple(800_000, 64_000, 24)
                "medium" -> Triple(2_000_000, 96_000, 30)
                "high" -> Triple(3_500_000, 128_000, 30)
                "safe_hd" -> Triple(1_500_000, 96_000, 24)
                else -> Triple(2_000_000, 96_000, 30)
            }
            
            val MAX_SAFE_WIDTH = 1280
            val MAX_SAFE_HEIGHT = 720

            var targetWidth = originalWidth
            var targetHeight = originalHeight

            if (originalWidth > MAX_SAFE_WIDTH || originalHeight > MAX_SAFE_HEIGHT) {
                val widthRatio = MAX_SAFE_WIDTH.toFloat() / originalWidth
                val heightRatio = MAX_SAFE_HEIGHT.toFloat() / originalHeight
                val ratio = min(widthRatio, heightRatio)
                
                targetWidth = (originalWidth * ratio).toInt()
                targetHeight = (originalHeight * ratio).toInt()
            }

            targetWidth = max(targetWidth, 2)
            targetHeight = max(targetHeight, 2)
            if (targetWidth % 2 != 0) targetWidth += 1
            if (targetHeight % 2 != 0) targetHeight += 1

            targetWidth = min(targetWidth, MAX_SAFE_WIDTH)
            targetHeight = min(targetHeight, MAX_SAFE_HEIGHT)

            val widthRatio = targetWidth.toFloat() / originalWidth.toFloat()
            val heightRatio = targetHeight.toFloat() / originalHeight.toFloat()
            var resizeFraction = min(widthRatio, heightRatio)

            if (resizeFraction <= 0 || resizeFraction > 1.0f || resizeFraction.isNaN()) {
                resizeFraction = 1.0f
            }

            try {
                val safeFrameRate = min(frameRate.toInt(), 30)
                
                val videoStrategy = DefaultVideoStrategy.Builder()
                    .frameRate(safeFrameRate)
                    .bitRate(videoBitrate.toLong())
                    .keyFrameInterval(3f)
                    .addResizer(FractionResizer(resizeFraction)) 
                    .build()
                    
                val audioStrategy = DefaultAudioStrategy.Builder()
                    .bitRate(96_000)
                    .channels(1)
                    .build()

                val latch = java.util.concurrent.CountDownLatch(1)
                var error: Throwable? = null
                
                val inputFileCheck = File(inputPath)
                if (!inputFileCheck.exists() || !inputFileCheck.canRead()) {
                    throw IOException("Arquivo de entrada inacessível: $inputPath")
                }
                
                val extractorCheck = MediaExtractor()
                try {
                    extractorCheck.setDataSource(inputPath)
                    if (extractorCheck.trackCount == 0) {
                         throw IOException("Arquivo de vídeo não contém faixas de mídia")
                    }
                    extractorCheck.selectTrack(0)
                } catch (e: Exception) {
                    throw IOException("Arquivo de vídeo inválido ou corrompido: ${e.message}")
                } finally {
                    extractorCheck.release()
                }
                
                val outputFileObj = File(outputPath)
                if (outputFileObj.exists()) outputFileObj.delete()

                Transcoder.into(outputPath)
                    .addDataSource(context, Uri.fromFile(File(inputPath)))
                    .setVideoTrackStrategy(videoStrategy)
                    .setAudioTrackStrategy(audioStrategy)
                    .setListener(object : TranscoderListener {
                        override fun onTranscodeProgress(progress: Double) {
                            val percent = (progress * 100).toInt()
                            val data = JSObject().apply {
                                put("progress", percent)
                                put("filePath", inputPath)
                            }
                            notifyListeners("videoProgress", data)
                        }
                        override fun onTranscodeCompleted(successCode: Int) { latch.countDown() }
                        override fun onTranscodeCanceled() { latch.countDown() }
                        override fun onTranscodeFailed(exception: Throwable) { error = exception; latch.countDown() }
                    })
                    .transcode()
                    
                latch.await()
                if (error != null) throw error as Throwable
                
                Log.d("VideoProcessor", "Compressão concluída com sucesso: $outputPath")
                return@withContext outputPath
                
            } catch (codecError: Throwable) {
                Log.e("VideoProcessor", "Falha na compressão primária, iniciando estratégias de recuperação", codecError)
                System.gc()
                
                try {
                    Log.w("VideoProcessor", "Tentativa de Recuperação 1: Resolução Original (Sem Resize)")
                    
                    val retryOriginalStrategy = DefaultVideoStrategy.Builder()
                        .frameRate(24) 
                        .bitRate(min(originalBitrate?.toLong() ?: 2_000_000L, 2_000_000L))
                        .build()
                        
                    val retryAudioStrategy = DefaultAudioStrategy.Builder()
                        .bitRate(96_000)
                        .channels(1)
                        .build()

                    val latchRetryOrig = java.util.concurrent.CountDownLatch(1)
                    var errorRetryOrig: Throwable? = null
                    
                    Transcoder.into(outputPath)
                        .addDataSource(context, Uri.fromFile(File(inputPath)))
                        .setVideoTrackStrategy(retryOriginalStrategy)
                        .setAudioTrackStrategy(retryAudioStrategy)
                        .setListener(object : TranscoderListener {
                            override fun onTranscodeProgress(progress: Double) {
                                val percent = (progress * 100).toInt()
                                val data = JSObject().apply {
                                    put("progress", percent)
                                    put("filePath", inputPath)
                                }
                                notifyListeners("videoProgress", data)
                            }
                            override fun onTranscodeCompleted(successCode: Int) { latchRetryOrig.countDown() }
                            override fun onTranscodeCanceled() { latchRetryOrig.countDown() }
                            override fun onTranscodeFailed(exception: Throwable) { errorRetryOrig = exception; latchRetryOrig.countDown() }
                        })
                        .transcode()
                        
                    latchRetryOrig.await()
                    if (errorRetryOrig != null) throw errorRetryOrig as Throwable
                    
                    Log.d("VideoProcessor", "Compressão bem sucedida na Recuperação 1 (Resolução Original)")
                    return@withContext outputPath
                    
                } catch (retryOrigError: Throwable) {
                     Log.e("VideoProcessor", "Falha na Recuperação 1, tentando reduzir resolução", retryOrigError)
                     System.gc()
                }

                try {
                    Log.w("VideoProcessor", "Tentativa de Recuperação 2: 480p (Safe Mode)")
                    val retryWidth = 848
                    val retryHeight = 480
                    val retryFraction = min(retryWidth.toFloat() / originalWidth.toFloat(), retryHeight.toFloat() / originalHeight.toFloat())

                    val retryStrategy = DefaultVideoStrategy.Builder()
                        .frameRate(24)
                        .bitRate(1_000_000L)
                        .addResizer(FractionResizer(retryFraction))
                        .build()
                        
                    val retryAudioStrategy = DefaultAudioStrategy.Builder()
                        .bitRate(64_000L)
                        .channels(1)
                        .build()

                    val latchRetry = java.util.concurrent.CountDownLatch(1)
                    var errorRetry: Throwable? = null
                    
                    Transcoder.into(outputPath)
                        .addDataSource(context, Uri.fromFile(File(inputPath)))
                        .setVideoTrackStrategy(retryStrategy)
                        .setAudioTrackStrategy(retryAudioStrategy)
                        .setListener(object : TranscoderListener {
                            override fun onTranscodeProgress(progress: Double) {
                                val percent = (progress * 100).toInt()
                                val data = JSObject().apply {
                                    put("progress", percent)
                                    put("filePath", inputPath)
                                }
                                notifyListeners("videoProgress", data)
                            }
                            override fun onTranscodeCompleted(successCode: Int) { latchRetry.countDown() }
                            override fun onTranscodeCanceled() { latchRetry.countDown() }
                            override fun onTranscodeFailed(exception: Throwable) { errorRetry = exception; latchRetry.countDown() }
                        })
                        .transcode()
                        
                    latchRetry.await()
                    if (errorRetry != null) throw errorRetry as Throwable
                    
                    Log.d("VideoProcessor", "Compressão bem sucedida no modo de recuperação (480p)")
                    return@withContext outputPath
                    
                } catch (retryError: Throwable) {
                    Log.e("VideoProcessor", "Falha em 480p, tentando 360p (Ultra Low)", retryError)
                    System.gc()
                    
                    try {
                        val finalRetryWidth = 640
                        val finalRetryHeight = 360
                        val finalRetryFraction = min(finalRetryWidth.toFloat() / originalWidth.toFloat(), finalRetryHeight.toFloat() / originalHeight.toFloat())

                        val finalRetryStrategy = DefaultVideoStrategy.Builder()
                            .frameRate(24)
                            .bitRate(500_000)
                            .addResizer(FractionResizer(finalRetryFraction))
                            .build()
                        
                        val finalRetryAudioStrategy = DefaultAudioStrategy.Builder()
                            .bitRate(64_000)
                            .channels(1)
                            .build()

                        val latchFinal = java.util.concurrent.CountDownLatch(1)
                        var errorFinal: Throwable? = null
                        
                        Transcoder.into(outputPath)
                            .addDataSource(context, Uri.fromFile(File(inputPath)))
                            .setVideoTrackStrategy(finalRetryStrategy)
                            .setAudioTrackStrategy(finalRetryAudioStrategy)
                            .setListener(object : TranscoderListener {
                                override fun onTranscodeProgress(progress: Double) {
                                    val percent = (progress * 100).toInt()
                                    val data = JSObject().apply {
                                        put("progress", percent)
                                        put("filePath", inputPath)
                                    }
                                    notifyListeners("videoProgress", data)
                                }
                                override fun onTranscodeCompleted(successCode: Int) { latchFinal.countDown() }
                                override fun onTranscodeCanceled() { latchFinal.countDown() }
                                override fun onTranscodeFailed(exception: Throwable) { errorFinal = exception; latchFinal.countDown() }
                            })
                            .transcode()
                            
                        latchFinal.await()
                        if (errorFinal != null) throw errorFinal as Throwable
                        
                        Log.d("VideoProcessor", "Compressão bem sucedida no modo de emergência (360p)")
                        return@withContext outputPath
                        
                    } catch (finalError: Throwable) {
                        Log.e("VideoProcessor", "Todas as tentativas de compressão falharam", finalError)
                        throw Exception("Falha crítica na compressão de vídeo. Não foi possível reduzir o tamanho do arquivo. Erro: ${finalError.message}")
                    }
                }
            }
        } catch (e: Throwable) {
            Log.e("VideoProcessor", "Erro fatal ao comprimir vídeo", e)
            if (outputFile.exists()) {
                outputFile.delete()
            }
            throw Exception(e)
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

    private fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
        val (height: Int, width: Int) = options.outHeight to options.outWidth
        var inSampleSize = 1
        if (height > reqHeight || width > reqWidth) {
            val halfHeight: Int = height / 2
            val halfWidth: Int = width / 2
            while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                inSampleSize *= 2
            }
        }
        return inSampleSize
    }
    
    private suspend fun uploadFile(
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
    
    @PluginMethod
    fun cleanupResources(call: PluginCall) {
        try {
            coroutineScope.cancel("Cleanup requested")
            uploadJobs.clear()
            
            context.cacheDir?.listFiles()?.forEach { file ->
                if (file.name.startsWith("temp_") || 
                    file.name.startsWith("capture_") || 
                    file.name.startsWith("thumb_") ||
                    file.name.endsWith(".converted.webp") ||
                    file.name.endsWith(".compressed.jpg") ||
                    file.name.endsWith(".compressed.mp4")) {
                    try {
                        file.delete()
                    } catch (e: Exception) {
                        Log.w("VideoProcessor", "Erro ao limpar arquivo: ${file.name}")
                    }
                }
            }
            
            call.resolve()
        } catch (e: Exception) {
            call.reject("Erro ao limpar recursos: ${e.message}")
        }
    }
    
    fun cleanup() {
        coroutineScope.cancel()
        uploadJobs.clear()
    }
}