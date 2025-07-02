import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir, appendFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// In-memory storage for multipart uploads (use Redis or DB in production)
const multipartUploads = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const chunk = formData.get('chunk') as File
    const chunkIndex = parseInt(formData.get('chunkIndex') as string)
    const uploadId = formData.get('uploadId') as string

    if (!chunk || isNaN(chunkIndex) || !uploadId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Create temp directory for chunks
    const tempDir = join(process.cwd(), 'temp', 'uploads', uploadId)
    await mkdir(tempDir, { recursive: true })

    // Write chunk to temp file
    const chunkPath = join(tempDir, `chunk_${chunkIndex}`)
    const bytes = await chunk.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(chunkPath, buffer)

    // Update upload progress
    upload.uploadedChunks.push(chunkIndex)
    multipartUploads.set(uploadId, upload)

    return NextResponse.json({
      chunkIndex,
      uploadId,
      status: 'uploaded',
    })
  } catch (error) {
    console.error('Chunk upload error:', error)
    return NextResponse.json(
      { error: 'Chunk upload failed' },
      { status: 500 }
    )
  }
}