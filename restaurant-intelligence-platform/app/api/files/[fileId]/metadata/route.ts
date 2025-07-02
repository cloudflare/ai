import { NextRequest, NextResponse } from 'next/server'
import { stat } from 'fs/promises'
import { join } from 'path'
import { FileMetadata } from '@/lib/types/integrations'

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const { fileId } = params
    
    // In a real implementation, fetch from database
    const uploadDir = join(process.cwd(), 'public', 'uploads')
    const files = await import('fs/promises').then(fs => fs.readdir(uploadDir))
    const matchingFile = files.find(file => file.includes(fileId))
    
    if (!matchingFile) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    const filepath = join(uploadDir, matchingFile)
    const stats = await stat(filepath)
    const extension = matchingFile.split('.').pop()

    const metadata: FileMetadata = {
      id: fileId,
      name: matchingFile,
      originalName: matchingFile,
      size: stats.size,
      type: 'application/octet-stream', // Would determine from extension
      extension: `.${extension}`,
      uploadedAt: stats.birthtime,
      url: `/uploads/${matchingFile}`,
    }

    return NextResponse.json({
      metadata,
    })
  } catch (error) {
    console.error('Metadata error:', error)
    return NextResponse.json(
      { error: 'Failed to get metadata' },
      { status: 500 }
    )
  }
}