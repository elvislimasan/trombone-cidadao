import { registerPlugin } from '@capacitor/core';

export interface VideoMetadata {
  duration: number; // em segundos
  width: number;
  height: number;
  size: number; // em bytes
  bitrate?: number;
  codec?: string;
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

export interface VideoProcessorPlugin {
  /**
   * Obtém metadados do vídeo sem carregar o arquivo completo
   */
  getVideoMetadata(options: { filePath: string }): Promise<VideoMetadata>;
  
  /**
   * Comprime vídeo usando processamento nativo
   * Retorna o caminho do vídeo comprimido
   */
  compressVideo(options: { filePath: string } & VideoCompressOptions): Promise<VideoCompressResult>;
  
  /**
   * Faz upload de arquivo de forma bloqueante (aguarda conclusão)
   */
  uploadFile(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ success: boolean; uploadId: string }>;

  /**
   * Faz upload do vídeo em background usando serviço nativo
   * Retorna ID do upload para acompanhar progresso
   */
  uploadVideoInBackground(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ uploadId: string }>;
  
  /**
   * Obtém progresso do upload em background
   */
  getUploadProgress(uploadId: string): Promise<{ progress: number; status: string }>;
  
  /**
   * Cancela upload em background
   */
  cancelUpload(uploadId: string): Promise<void>;

  /**
   * Captura vídeo usando a câmera nativa com limites
   */
  captureVideo(options: { maxDurationSec?: number; lowQuality?: boolean }): Promise<{ filePath: string }>;
  capturePhoto(options?: { lowQuality?: boolean; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high' }): Promise<{ filePath: string }>;
  getImageMetadata(options: { filePath: string }): Promise<{ width: number; height: number; size: number }>;
  compressImage(options: { filePath: string; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high'; format?: 'webp' | 'jpeg' | 'png' }): Promise<{ outputPath: string; originalSize: number; compressedSize: number; compressionRatio: number }>;
  getVideoThumbnail(options: { filePath: string; atMs?: number; maxWidth?: number; maxHeight?: number }): Promise<{ imagePath: string }>;
}

const VideoProcessor = registerPlugin<VideoProcessorPlugin>('VideoProcessor', {
  web: () => import('./VideoProcessor.web').then(m => new m.VideoProcessorWeb()),
});

export * from './definitions';
export { VideoProcessor };

