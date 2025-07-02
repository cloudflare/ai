import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { FileMetadata } from '@/lib/types/integrations'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const metadata = formData.get('metadata') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })

    // Generate unique filename
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 15)
    const extension = file.name.split('.').pop()
    const filename = `${timestamp}_${randomString}.${extension}`
    const filepath = join(uploadDir, filename)

    // Write file to disk
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    // Create file metadata
    const fileMetadata: FileMetadata = {
      id: `file_${timestamp}_${randomString}`,
      name: filename,
      originalName: file.name,
      size: file.size,
      type: file.type,
      extension: `.${extension}`,
      uploadedAt: new Date(),
      url: `/uploads/${filename}`,
      ...(metadata ? JSON.parse(metadata) : {}),
    }

    // Generate thumbnail for images
    if (file.type.startsWith('image/')) {
      // In a real implementation, you would generate a thumbnail here
      fileMetadata.thumbnailUrl = fileMetadata.url
    }

    return NextResponse.json({
      file: fileMetadata,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}