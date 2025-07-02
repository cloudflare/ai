import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, unlink, rmdir, mkdir } from 'fs/promises'
import { join } from 'path'
import { FileMetadata } from '@/lib/types/integrations'

// In-memory storage for multipart uploads (use Redis or DB in production)
const multipartUploads = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const { uploadId } = await request.json()

    if (!uploadId) {
      return NextResponse.json(
        { error: 'Upload ID required' },
        { status: 400 }
      )
    }

    const upload = multipartUploads.get(uploadId)
    if (!upload) {
      return NextResponse.json(
        { error: 'Upload not found' },
        { status: 404 }
      )
    }

    // Verify all chunks are uploaded
    const expectedChunks = Array.from({ length: upload.totalChunks }, (_, i) => i)
    const missingChunks = expectedChunks.filter(i => !upload.uploadedChunks.includes(i))
    
    if (missingChunks.length > 0) {
      return NextResponse.json(
        { error: 'Missing chunks', missingChunks },
        { status: 400 }
      )
    }

    // Combine chunks
    const tempDir = join(process.cwd(), 'temp', 'uploads', uploadId)
    const uploadDir = join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })

    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 15)
    const extension = upload.fileName.split('.').pop()
    const filename = `${timestamp}_${randomString}.${extension}`
    const filepath = join(uploadDir, filename)

    // Read and combine all chunks
    const chunks: Buffer[] = []
    for (let i = 0; i < upload.totalChunks; i++) {
      const chunkPath = join(tempDir, `chunk_${i}`)
      const chunkData = await readFile(chunkPath)
      chunks.push(chunkData)
    }

    // Write combined file
    const combinedBuffer = Buffer.concat(chunks)
    await writeFile(filepath, combinedBuffer)

    // Clean up temp files
    for (let i = 0; i < upload.totalChunks; i++) {
      const chunkPath = join(tempDir, `chunk_${i}`)
      await unlink(chunkPath)
    }
    await rmdir(tempDir)

    // Remove from memory
    multipartUploads.delete(uploadId)

    // Create file metadata
    const fileMetadata: FileMetadata = {
      id: `file_${timestamp}_${randomString}`,
      name: filename,
      originalName: upload.fileName,
      size: upload.fileSize,
      type: upload.fileType,
      extension: `.${extension}`,
      uploadedAt: new Date(),
      url: `/uploads/${filename}`,
    }

    return NextResponse.json({
      file: fileMetadata,
    })
  } catch (error) {
    console.error('Complete upload error:', error)
    return NextResponse.json(
      { error: 'Failed to complete upload' },
      { status: 500 }
    )
  }
}