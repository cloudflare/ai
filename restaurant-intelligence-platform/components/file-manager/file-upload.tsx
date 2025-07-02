'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  Upload, 
  X, 
  FileIcon, 
  ImageIcon, 
  VideoIcon, 
  FileTextIcon,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Trash2,
  Eye
} from 'lucide-react'
import { FileHandler } from '@/lib/integrations/file-handler'
import { FileMetadata } from '@/lib/types/integrations'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  maxSize?: number
  allowedTypes?: string[]
  multiple?: boolean
  onUploadComplete?: (files: FileMetadata[]) => void
  onError?: (error: string) => void
  className?: string
}

interface UploadingFile {
  id: string
  file: File
  progress: number
  status: 'uploading' | 'completed' | 'error'
  error?: string
  metadata?: FileMetadata
}

export function FileUpload({
  maxSize = 100 * 1024 * 1024, // 100MB
  allowedTypes,
  multiple = true,
  onUploadComplete,
  onError,
  className
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([])
  const [completedFiles, setCompletedFiles] = useState<FileMetadata[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileHandler = useRef(new FileHandler({ maxSize, allowedTypes }))

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }, [])

  const handleFiles = async (files: File[]) => {
    if (!multiple && files.length > 1) {
      files = [files[0]]
    }

    const newUploadingFiles: UploadingFile[] = files.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      progress: 0,
      status: 'uploading' as const
    }))

    setUploadingFiles(prev => [...prev, ...newUploadingFiles])

    for (const uploadingFile of newUploadingFiles) {
      try {
        const result = await fileHandler.current.uploadFile(
          uploadingFile.file,
          (progress) => {
            setUploadingFiles(prev => 
              prev.map(f => 
                f.id === uploadingFile.id 
                  ? { ...f, progress: progress.percentage }
                  : f
              )
            )
          }
        )

        if (result.success && result.data) {
          setUploadingFiles(prev => 
            prev.map(f => 
              f.id === uploadingFile.id 
                ? { ...f, status: 'completed', metadata: result.data }
                : f
            )
          )
          setCompletedFiles(prev => [...prev, result.data])
        } else {
          throw new Error(result.error || 'Upload failed')
        }
      } catch (error) {
        const errorMessage = (error as Error).message
        setUploadingFiles(prev => 
          prev.map(f => 
            f.id === uploadingFile.id 
              ? { ...f, status: 'error', error: errorMessage }
              : f
          )
        )
        onError?.(errorMessage)
      }
    }

    // Notify parent component of completed uploads
    const successfulUploads = newUploadingFiles
      .map(f => uploadingFiles.find(u => u.id === f.id)?.metadata)
      .filter(Boolean) as FileMetadata[]
    
    if (successfulUploads.length > 0) {
      onUploadComplete?.(successfulUploads)
    }
  }

  const removeFile = (fileId: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const removeCompletedFile = async (file: FileMetadata) => {
    try {
      await fileHandler.current.deleteFile(file.id)
      setCompletedFiles(prev => prev.filter(f => f.id !== file.id))
    } catch (error) {
      onError?.((error as Error).message)
    }
  }

  const downloadFile = async (file: FileMetadata) => {
    try {
      await fileHandler.current.downloadFile(file.id, file.originalName)
    } catch (error) {
      onError?.((error as Error).message)
    }
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="h-8 w-8" />
    if (type.startsWith('video/')) return <VideoIcon className="h-8 w-8" />
    if (type === 'application/pdf') return <FileTextIcon className="h-8 w-8" />
    return <FileIcon className="h-8 w-8" />
  }

  const formatFileSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardContent className="p-0">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple={multiple}
              accept={allowedTypes?.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />

            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-muted-foreground">
              {allowedTypes ? `Accepted files: ${allowedTypes.join(', ')}` : 'All file types accepted'}
            </p>
            <p className="text-sm text-muted-foreground">
              Max file size: {formatFileSize(maxSize)}
            </p>
          </div>
        </CardContent>
      </Card>

      {uploadingFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploading Files</CardTitle>
            <CardDescription>
              {uploadingFiles.filter(f => f.status === 'uploading').length} files in progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {uploadingFiles.map((file) => (
                <div key={file.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getFileIcon(file.file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {file.file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {file.status === 'uploading' && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {file.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {file.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(file.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="h-2" />
                  )}
                  
                  {file.error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{file.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {completedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uploaded Files</CardTitle>
            <CardDescription>
              {completedFiles.length} files uploaded successfully
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {completedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3 flex-1">
                    {file.thumbnailUrl ? (
                      <img 
                        src={file.thumbnailUrl} 
                        alt={file.name}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      getFileIcon(file.type)
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.originalName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {file.url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(file.url, '_blank')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => downloadFile(file)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCompletedFile(file)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}