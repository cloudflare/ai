import { IntegrationResponse } from '@/lib/types/integrations';

interface FileUploadOptions {
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  allowedExtensions?: string[];
  validateContent?: boolean;
  scanForVirus?: boolean;
}

interface FileMetadata {
  id: string;
  name: string;
  originalName: string;
  size: number;
  type: string;
  extension: string;
  uploadedAt: Date;
  url?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
}

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface ChunkUploadInfo {
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number;
  uploadId: string;
}

export class FileHandler {
  private defaultOptions: FileUploadOptions = {
    maxSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'text/plain',
    ],
    allowedExtensions: [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.mp4', '.webm', '.mov',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.csv', '.txt',
    ],
    validateContent: true,
    scanForVirus: false, // Would require integration with virus scanning service
  };

  private chunkSize = 5 * 1024 * 1024; // 5MB chunks for large files

  constructor(private options: FileUploadOptions = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  async validateFile(file: File): Promise<IntegrationResponse<boolean>> {
    try {
      // Check file size
      if (this.options.maxSize && file.size > this.options.maxSize) {
        return {
          success: false,
          error: `File size exceeds maximum allowed size of ${this.formatFileSize(this.options.maxSize)}`,
        };
      }

      // Check file type
      if (this.options.allowedTypes && !this.options.allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: `File type "${file.type}" is not allowed`,
        };
      }

      // Check file extension
      const extension = this.getFileExtension(file.name);
      if (this.options.allowedExtensions && !this.options.allowedExtensions.includes(extension.toLowerCase())) {
        return {
          success: false,
          error: `File extension "${extension}" is not allowed`,
        };
      }

      // Validate content if enabled
      if (this.options.validateContent) {
        const contentValidation = await this.validateFileContent(file);
        if (!contentValidation.success) {
          return contentValidation;
        }
      }

      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async validateFileContent(file: File): Promise<IntegrationResponse<boolean>> {
    try {
      // Read file header to verify file type
      const buffer = await this.readFileHeader(file);
      const actualType = this.detectFileType(buffer);

      if (actualType && file.type !== actualType) {
        return {
          success: false,
          error: `File content does not match declared type. Expected: ${file.type}, Actual: ${actualType}`,
        };
      }

      // Additional content validation based on file type
      if (file.type.startsWith('image/')) {
        return this.validateImageContent(file);
      } else if (file.type.startsWith('video/')) {
        return this.validateVideoContent(file);
      } else if (file.type === 'application/pdf') {
        return this.validatePDFContent(file);
      }

      return { success: true, data: true };
    } catch (error) {
      return {
        success: false,
        error: `Content validation failed: ${(error as Error).message}`,
      };
    }
  }

  private async readFileHeader(file: File, bytes: number = 512): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file.slice(0, bytes));
    });
  }

  private detectFileType(buffer: ArrayBuffer): string | null {
    const bytes = new Uint8Array(buffer);
    
    // Check for common file signatures
    const signatures: Record<string, number[][]> = {
      'image/jpeg': [[0xFF, 0xD8, 0xFF]],
      'image/png': [[0x89, 0x50, 0x4E, 0x47]],
      'image/gif': [[0x47, 0x49, 0x46, 0x38]],
      'image/webp': [[0x52, 0x49, 0x46, 0x46], [0x57, 0x45, 0x42, 0x50]],
      'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
      'video/mp4': [[0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]],
    };

    for (const [type, sigs] of Object.entries(signatures)) {
      for (const sig of sigs) {
        if (sig.every((byte, index) => bytes[index] === byte)) {
          return type;
        }
      }
    }

    return null;
  }

  private async validateImageContent(file: File): Promise<IntegrationResponse<boolean>> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ success: true, data: true });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ success: false, error: 'Invalid image file' });
      };

      img.src = url;
    });
  }

  private async validateVideoContent(file: File): Promise<IntegrationResponse<boolean>> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({ success: true, data: true });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ success: false, error: 'Invalid video file' });
      };

      video.src = url;
    });
  }

  private async validatePDFContent(file: File): Promise<IntegrationResponse<boolean>> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Check PDF header
      const header = String.fromCharCode(...bytes.slice(0, 5));
      if (!header.startsWith('%PDF-')) {
        return { success: false, error: 'Invalid PDF file' };
      }

      // Check for EOF marker
      const trailer = String.fromCharCode(...bytes.slice(-7));
      if (!trailer.includes('%%EOF')) {
        return { success: false, error: 'PDF file appears to be corrupted' };
      }

      return { success: true, data: true };
    } catch (error) {
      return { success: false, error: 'Failed to validate PDF content' };
    }
  }

  async uploadFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<IntegrationResponse<FileMetadata>> {
    try {
      // Validate file first
      const validation = await this.validateFile(file);
      if (!validation.success) {
        return { success: false, error: validation.error };
      }

      // For large files, use chunked upload
      if (file.size > this.chunkSize) {
        return this.uploadLargeFile(file, onProgress);
      }

      // For small files, upload directly
      return this.uploadSmallFile(file, onProgress);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async uploadSmallFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<IntegrationResponse<FileMetadata>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify({
      originalName: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    }));

    try {
      const response = await this.uploadWithProgress(
        '/api/upload',
        formData,
        onProgress
      );

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.file,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async uploadLargeFile(
    file: File,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<IntegrationResponse<FileMetadata>> {
    try {
      const totalChunks = Math.ceil(file.size / this.chunkSize);
      const uploadId = this.generateUploadId();
      let uploadedBytes = 0;

      // Initialize multipart upload
      const initResponse = await fetch('/api/upload/multipart/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          totalChunks,
          uploadId,
        }),
      });

      if (!initResponse.ok) {
        throw new Error('Failed to initialize multipart upload');
      }

      // Upload chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * this.chunkSize;
        const end = Math.min(start + this.chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('uploadId', uploadId);

        const chunkResponse = await this.uploadWithProgress(
          `/api/upload/multipart/chunk`,
          formData,
          (chunkProgress) => {
            const totalProgress = uploadedBytes + chunkProgress.loaded;
            onProgress?.({
              loaded: totalProgress,
              total: file.size,
              percentage: (totalProgress / file.size) * 100,
            });
          }
        );

        if (!chunkResponse.ok) {
          throw new Error(`Failed to upload chunk ${chunkIndex + 1}`);
        }

        uploadedBytes += chunk.size;
      }

      // Complete multipart upload
      const completeResponse = await fetch('/api/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });

      if (!completeResponse.ok) {
        throw new Error('Failed to complete multipart upload');
      }

      const data = await completeResponse.json();
      return {
        success: true,
        data: data.file,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async uploadWithProgress(
    url: string,
    data: FormData,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage: (event.loaded / event.total) * 100,
          });
        }
      });

      xhr.addEventListener('load', () => {
        const response = new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: this.parseHeaders(xhr.getAllResponseHeaders()),
        });
        resolve(response);
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', url);
      xhr.send(data);
    });
  }

  private parseHeaders(headerString: string): Headers {
    const headers = new Headers();
    const lines = headerString.trim().split('\r\n');
    
    lines.forEach(line => {
      const [name, value] = line.split(': ');
      if (name && value) {
        headers.append(name, value);
      }
    });

    return headers;
  }

  async downloadFile(
    fileId: string,
    fileName?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<IntegrationResponse<Blob>> {
    try {
      const response = await this.downloadWithProgress(
        `/api/download/${fileId}`,
        onProgress
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Trigger browser download
      if (typeof window !== 'undefined' && fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      return {
        success: true,
        data: blob,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  private async downloadWithProgress(
    url: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<Response> {
    const response = await fetch(url);
    
    if (!response.body) {
      return response;
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    const reader = response.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          loaded += value.byteLength;
          onProgress?.({
            loaded,
            total,
            percentage: total > 0 ? (loaded / total) * 100 : 0,
          });
          
          controller.enqueue(value);
        }
        
        controller.close();
      },
    });

    return new Response(stream, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async deleteFile(fileId: string): Promise<IntegrationResponse<boolean>> {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  async getFileMetadata(fileId: string): Promise<IntegrationResponse<FileMetadata>> {
    try {
      const response = await fetch(`/api/files/${fileId}/metadata`);

      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: data.metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

// Export singleton instance with default options
export const fileHandler = new FileHandler();