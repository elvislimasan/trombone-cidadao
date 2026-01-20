export interface VideoMetadata {
  duration: number; // em segundos
  width: number;
  height: number;
  size: number; // em bytes
  bitrate?: number;
  codec?: string;
}

export interface ImageMetadata {
  width: number;
  height: number;
  size: number;
}

export interface VideoCompressOptions {
  quality: 'low' | 'medium' | 'high'; // Qualidade de compressão
  maxWidth?: number; // Largura máxima (opcional)
  maxHeight?: number; // Altura máxima (opcional)
  maxFileSize?: number; // Tamanho máximo em bytes (opcional)
}

export interface VideoCompressResult {
  outputPath: string; // Caminho do vídeo comprimido
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // Percentual de redução
}

export interface VideoCompressProgress {
  frame: number;
  totalFrames: number;
  progress: number; 
}

export interface UploadProgressEvent {
  id: string;
  progress: number;
  status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'error' | string;
}

export interface VideoProcessorPlugin {
  /**
   * Captura vídeo usando a câmera nativa com limites
   */
  captureVideo(options?: { maxDurationSec?: number; lowQuality?: boolean }): Promise<{ filePath: string }>;
  
  /**
   * Seleciona vídeo da galeria nativa
   */
  pickVideo(): Promise<{ filePath: string; name: string; size: number; duration: number }>;

  /**
   * Obtém metadados do vídeo sem carregar o arquivo completo
   */
  getVideoMetadata(options: { filePath: string }): Promise<VideoMetadata>;
  
  /**
   * Gera thumbnail de vídeo
   */
  getVideoThumbnail(options: { filePath: string; atMs?: number; maxWidth?: number; maxHeight?: number }): Promise<{ imagePath: string }>;

  /**
   * Captura foto
   */
  capturePhoto(options?: { lowQuality?: boolean; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high' }): Promise<{ filePath: string }>;
  
  /**
   * Tenta recuperar uma foto perdida após o sistema matar o app (OOM)
   */
  recoverLostPhoto(): Promise<{ filePath?: string; nativePath?: string; isRecovered?: boolean }>;

  /**
   * Obtém metadados de imagem
   */
  getImageMetadata(options: { filePath: string }): Promise<ImageMetadata>;
  
  /**
   * Comprime vídeo usando processamento nativo
   */
  compressVideo(options: { filePath: string } & VideoCompressOptions): Promise<VideoCompressResult>;
  
  /**
   * Comprime imagem
   */
  compressImage(options: { filePath: string; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high'; format?: 'webp' | 'jpeg' | 'png' }): Promise<{ outputPath: string; originalSize: number; compressedSize: number; compressionRatio: number }>;
  
  /**
   * Faz upload de arquivo de forma bloqueante (aguarda conclusão)
   */
  uploadFile(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ success: boolean; uploadId: string }>;

  /**
   * Faz upload do vídeo em background usando serviço nativo (Foreground Service no Android)
   */
  uploadVideoInBackground(options: { filePath: string; uploadUrl: string; headers?: Record<string, string> }): Promise<{ uploadId: string }>;
  
  /**
   * Obtém progresso do upload em background
   */
  getUploadProgress(options: { uploadId: string }): Promise<{ progress: number; status: string }>;
  
  /**
   * Cancela upload em background
   */
  cancelUpload(options: { uploadId: string }): Promise<void>;

  /**
   * @deprecated Use getImageMetadata or generic thumbnail generation
   */
  generateImageThumbnail(options: { filePath: string; maxWidth?: number; maxHeight?: number; quality?: number }): Promise<{ thumbnailPath: string }>;
}
