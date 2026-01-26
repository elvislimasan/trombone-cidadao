package com.trombonecidadao.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.media.MediaMetadataRetriever
import android.provider.OpenableColumns
import androidx.core.app.NotificationCompat
import com.otaliastudios.transcoder.Transcoder
import com.otaliastudios.transcoder.TranscoderListener
import com.otaliastudios.transcoder.resize.AtMostResizer
import com.otaliastudios.transcoder.strategy.DefaultAudioStrategy
import com.otaliastudios.transcoder.strategy.DefaultVideoStrategy
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okio.BufferedSink
import okio.Buffer
import okio.source
import java.io.File
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class UploadService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())
    private val notificationId = 1001
    private val channelId = "upload_channel"

    companion object {
        var progressListener: ((String, Int, String) -> Unit)? = null
        private val activeUploads = mutableMapOf<String, Job>()

        fun cancelUpload(id: String?) {
            id?.let {
                activeUploads[it]?.cancel()
                activeUploads.remove(it)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val uploadId = intent?.getStringExtra("uploadId") ?: return START_NOT_STICKY
        val filePath = intent.getStringExtra("filePath") ?: return START_NOT_STICKY
        val uploadUrl = intent.getStringExtra("uploadUrl") ?: return START_NOT_STICKY
        val headers = intent.getSerializableExtra("headers") as? HashMap<String, String>
        val skipCompression = intent.getBooleanExtra("skipCompression", false)

        startForeground(notificationId, createNotification("Iniciando processo...", 0))

        val job = serviceScope.launch {
            try {
                processAndUpload(uploadId, filePath, uploadUrl, headers, skipCompression)
            } catch (e: CancellationException) {
                Log.w("UploadService", "Upload cancelled: $uploadId")
                notifyProgress(uploadId, 0, "cancelled")
                val manager = getSystemService(NotificationManager::class.java)
                manager.cancel(notificationId) // Remove notification on cancel
            } catch (e: Exception) {
                Log.e("UploadService", "Error", e)
                notifyProgress(uploadId, 0, "error")
                updateNotification("Erro no envio", 0)
            } finally {
                activeUploads.remove(uploadId)
                if (activeUploads.isEmpty()) {
                    stopSelf()
                }
            }
        }
        
        activeUploads[uploadId] = job

        return START_NOT_STICKY
    }

    private suspend fun processAndUpload(id: String, path: String, url: String, headers: HashMap<String, String>?, skipCompression: Boolean) {
        var tempCompressedFile: File? = null

        try {
            // 1. Determine Input (Uri or File)
            val isContentUri = path.startsWith("content://")
            val inputUri = if (isContentUri) Uri.parse(path) else Uri.fromFile(File(path))

            // 2. Compress (only if NOT skipped)
            var fileToUpload: Any = if (isContentUri) inputUri else File(path)

            if (!skipCompression) {
                notifyProgress(id, 0, "compressing")
                updateNotification("Otimizando vídeo...", 0)
                
                val compressedFile = File(cacheDir, "compressed_${id}.mp4")
                
                try {
                    val compressionSuccess = compressVideo(inputUri, compressedFile, id)
                    
                    if (compressionSuccess && compressedFile.exists() && compressedFile.length() > 0) {
                         fileToUpload = compressedFile
                         tempCompressedFile = compressedFile
                    } else {
                         Log.e("UploadService", "Compression failed. Aborting.")
                         throw IOException("Compression failed")
                    }
                } catch (e: Exception) {
                     if (e is CancellationException) throw e
                     Log.e("UploadService", "Compression exception", e)
                     throw IOException("Compression exception", e)
                }
            }

            // 3. Upload
            notifyProgress(id, 0, "uploading")
            updateNotification("Enviando...", 0)
            
            val contentType = headers?.get("Content-Type")?.toMediaType() ?: "video/mp4".toMediaType()
            val requestBody = if (fileToUpload is File) {
                createProgressRequestBodyFromFile(contentType, fileToUpload as File) { progress ->
                    notifyProgress(id, progress, "uploading")
                    if (progress % 10 == 0) updateNotification("Enviando... $progress%", progress)
                }
            } else {
                createProgressRequestBodyFromUri(contentType, fileToUpload as Uri) { progress ->
                    notifyProgress(id, progress, "uploading")
                    if (progress % 10 == 0) updateNotification("Enviando... $progress%", progress)
                }
            }

            performUpload(id, requestBody, url, headers)

        } finally {
            // Cleanup compressed file
            if (tempCompressedFile != null && tempCompressedFile!!.exists()) {
                tempCompressedFile!!.delete()
            }
        }
    }

    private suspend fun compressVideo(inputUri: Uri, output: File, id: String): Boolean = suspendCancellableCoroutine { cont ->
        var videoBitrate = 1500 * 1000L // Default 1.5 Mbps
        
        try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(this, inputUri)
            val durationString = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
            val durationMs = durationString?.toLongOrNull() ?: 0L
            retriever.release()
            
            val durationSec = durationMs / 1000f
            
            if (durationSec > 0) {
                val maxSizeBytes = 48 * 1024 * 1024L
                val audioBitrate = 128 * 1000L
                val totalAvailableBits = maxSizeBytes * 8
                val audioBits = audioBitrate * durationSec
                val videoAvailableBits = totalAvailableBits - audioBits
                var maxAllowedBitrate = (videoAvailableBits / durationSec).toLong()
                var finalBitrate = Math.min(1500_000L, maxAllowedBitrate)
                if (finalBitrate > 2_000_000L) finalBitrate = 2_000_000L
                if (finalBitrate < 500_000L) finalBitrate = 500_000L
                videoBitrate = finalBitrate
            }
        } catch (e: Exception) {
            Log.e("UploadService", "Failed to calculate bitrate", e)
        }

        val strategy = DefaultVideoStrategy.Builder()
                .keyFrameInterval(3f)
                .bitRate(videoBitrate)
                .frameRate(30)
                .addResizer(AtMostResizer(1080))
                .build()

        val future = Transcoder.into(output.absolutePath)
            .addDataSource(this, inputUri)
            .setVideoTrackStrategy(strategy)
            .setAudioTrackStrategy(DefaultAudioStrategy.builder()
                .bitRate(128 * 1000)
                .channels(1)
                .build())
            .setListener(object : TranscoderListener {
                var lastTranscodeProgress = -1
                
                override fun onTranscodeProgress(progress: Double) {
                    val globalProgress = (progress * 100).toInt()
                    notifyProgress(id, globalProgress, "compressing")
                    if (globalProgress > lastTranscodeProgress + 1 || globalProgress == 100) {
                        updateNotification("Otimizando... $globalProgress%", globalProgress)
                        lastTranscodeProgress = globalProgress
                    }
                }

                override fun onTranscodeCompleted(successCode: Int) {
                    if (cont.isActive) cont.resume(true) {}
                }

                override fun onTranscodeCanceled() {
                    if (cont.isActive) cont.resume(false) {}
                }

                override fun onTranscodeFailed(exception: Throwable) {
                    Log.e("UploadService", "Transcode failed", exception)
                    if (cont.isActive) cont.resume(false) {}
                }
            }).transcode()
            
        cont.invokeOnCancellation { 
            future.cancel(true)
        }
    }

    private suspend fun performUpload(id: String, requestBody: RequestBody, url: String, headers: HashMap<String, String>?) = suspendCancellableCoroutine<Unit> { cont ->
        val client = OkHttpClient.Builder()
            .connectTimeout(600, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(600, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(600, java.util.concurrent.TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        val requestBuilder = Request.Builder()
            .url(url)
            .put(requestBody)

        headers?.forEach { (key, value) ->
            if (!key.equals("Content-Type", ignoreCase = true) && !key.equals("Content-Length", ignoreCase = true)) {
                requestBuilder.addHeader(key, value)
            }
        }

        val call = client.newCall(requestBuilder.build())
        
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (cont.isActive) {
                    if (call.isCanceled()) {
                         cont.cancel(e)
                    } else {
                        Log.e("UploadService", "Network error during upload", e)
                        val errorMsg = if (e is java.net.SocketTimeoutException) "timeout" else e.message ?: "unknown"
                        notifyProgress(id, 0, "error_network_$errorMsg")
                        updateNotification("Erro de conexão", 0)
                        cont.resumeWithException(e)
                    }
                }
            }

            override fun onResponse(call: Call, response: Response) {
                 response.use {
                    if (response.isSuccessful) {
                        notifyProgress(id, 100, "completed")
                        updateNotification("Envio concluído!", 100)
                        if (cont.isActive) cont.resume(Unit) {}
                    } else {
                        val errorBody = response.body?.string() ?: "No body"
                        Log.e("UploadService", "Upload failed: ${response.code} $errorBody")
                        notifyProgress(id, 0, "error_upload_failed_${response.code}")
                        updateNotification("Falha no envio: ${response.code}", 0)
                        if (cont.isActive) cont.resumeWithException(IOException("Upload failed: ${response.code}"))
                    }
                 }
            }
        })

        cont.invokeOnCancellation {
            call.cancel()
        }
    }

    private fun createProgressRequestBodyFromFile(
        contentType: MediaType?, 
        file: File, 
        onProgress: (Int) -> Unit
    ): RequestBody {
        return object : RequestBody() {
            override fun contentType() = contentType
            override fun contentLength() = file.length()

            override fun writeTo(sink: BufferedSink) {
                val source = file.source()
                val buffer = Buffer()
                var totalBytesRead = 0L
                val fileLength = file.length()
                
                try {
                    var readCount: Long
                    while (source.read(buffer, 2048L).also { readCount = it } != -1L) {
                        sink.write(buffer, readCount)
                        totalBytesRead += readCount
                        val progress = if (fileLength > 0) (totalBytesRead * 100 / fileLength).toInt() else 0
                        onProgress(progress)
                    }
                } finally {
                    source.close()
                }
            }
        }
    }

    private fun createProgressRequestBodyFromUri(
        contentType: MediaType?, 
        uri: Uri, 
        onProgress: (Int) -> Unit
    ): RequestBody {
        return object : RequestBody() {
            override fun contentType() = contentType
            override fun contentLength(): Long {
                return try {
                    contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                            if (sizeIndex != -1) cursor.getLong(sizeIndex) else -1L
                        } else -1L
                    } ?: -1L
                } catch (e: Exception) {
                    -1L
                }
            }

            override fun writeTo(sink: BufferedSink) {
                val inputStream = contentResolver.openInputStream(uri) ?: throw IOException("Cannot open URI")
                val source = inputStream.source()
                val buffer = Buffer()
                var totalBytesRead = 0L
                val fileLength = contentLength()
                
                try {
                    var readCount: Long
                    while (source.read(buffer, 2048L).also { readCount = it } != -1L) {
                        sink.write(buffer, readCount)
                        totalBytesRead += readCount
                        val progress = if (fileLength > 0 && fileLength != -1L) (totalBytesRead * 100 / fileLength).toInt() else 0
                        onProgress(progress)
                    }
                } finally {
                    source.close()
                    inputStream.close()
                }
            }
        }
    }

    private fun notifyProgress(id: String, progress: Int, status: String) {
        progressListener?.invoke(id, progress, status)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Uploads",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createNotification(text: String, progress: Int): Notification {
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("Upload de Denúncia")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String, progress: Int) {
        val notification = createNotification(text, progress)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(notificationId, notification)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
}
