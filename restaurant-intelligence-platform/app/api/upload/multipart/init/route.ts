import { NextRequest, NextResponse } from 'next/server'

// In-memory storage for multipart uploads (use Redis or DB in production)
const multipartUploads = new Map<string, any>()

export async function POST(request: NextRequest) {
  try {
    const { fileName, fileSize, fileType, totalChunks, uploadId } = await request.json()

    if (!fileName || !fileSize || !uploadId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Initialize multipart upload
    multipartUploads.set(uploadId, {
      fileName,
      fileSize,
      fileType,
      totalChunks,
      uploadedChunks: [],
      createdAt: new Date(),
    })

    return NextResponse.json({
      uploadId,
      status: 'initialized',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to initialize upload' },
      { status: 500 }
    )
  }
}