import { WebPlugin } from '@capacitor/core';
import type { VideoProcessorPlugin, VideoMetadata, VideoCompressOptions, VideoCompressResult } from './definitions';

export class VideoProcessorWeb extends WebPlugin implements VideoProcessorPlugin {
  generateImageThumbnail(options: { filePath: string; maxWidth?: number; maxHeight?: number; quality?: number; }): Promise<{ thumbnailPath: string; }> {
    throw new Error('Method not implemented.');
  }
  async captureVideo(options?: { maxDurationSec?: number; lowQuality?: boolean }): Promise<{ filePath: string }> {
    throw new Error('Captura de vídeo nativa não disponível na web');
  }

  async capturePhoto(options?: { lowQuality?: boolean; maxWidth?: number; maxHeight?: number; maxSizeMB?: number; quality?: 'low' | 'medium' | 'high' }): Promise<{ filePath: string }> {
    throw new Error('Captura de foto nativa não disponível na web');
  }
  async getImageMetadata(options: { filePath: string }): Promise<{ width: number; height: number; size: number }> {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, size: 0 });
        };
        img.onerror = () => reject(new Error('Falha ao obter metadados da imagem'));
        img.src = options.filePath;
      } catch (e) {
        reject(e);
      }
    });
  }
  async getVideoMetadata(options: { filePath: string }): Promise<VideoMetadata> {
    // Implementação web: usar HTML5 video element
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          size: 0, // Não disponível no web sem File
        });
      };
      
      video.onerror = () => {
        reject(new Error('Erro ao carregar metadados do vídeo'));
      };
      
      video.src = options.filePath;
    });
  }

  async getVideoThumbnail(): Promise<{ imagePath: string }> {
    throw new Error('Thumbnail de vídeo não disponível na web. Use a versão nativa.');
  }

  async compressVideo(options: { filePath: string } & VideoCompressOptions): Promise<VideoCompressResult> {
    // Web: retornar caminho original (sem compressão nativa)
    throw new Error('Compressão de vídeo não disponível na web. Use a versão nativa.');
  }

  async compressImage(): Promise<{ outputPath: string; originalSize: number; compressedSize: number; compressionRatio: number }> {
    throw new Error('Compressão de imagem não disponível na web. Use a versão nativa.');
  }

  async uploadFile(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ success: boolean; uploadId: string }> {
    throw new Error('Upload nativo não disponível na web.');
  }

  async uploadVideoInBackground(options: { filePath: string; uploadUrl: string; headers: Record<string, string> }): Promise<{ uploadId: string }> {
    // Web: fazer upload normal
    throw new Error('Upload em background não disponível na web. Use a versão nativa.');
  }

  async getUploadProgress(uploadId: string): Promise<{ progress: number; status: string }> {
    throw new Error('Não disponível na web');
  }

  async cancelUpload(uploadId: string): Promise<void> {
    throw new Error('Não disponível na web');
  }
}

