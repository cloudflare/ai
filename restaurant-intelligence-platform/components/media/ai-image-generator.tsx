'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { 
  Loader2, 
  Download, 
  Copy, 
  RefreshCw, 
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Settings,
  Share2,
  Save,
  Trash2,
  AlertCircle,
  X
} from 'lucide-react'
import { MediaGenerator } from '@/lib/integrations/media-generator'
import type { MediaGenerationResult as GeneratedMedia } from '@/lib/types/integrations'

interface AIImageGeneratorProps {
  onImageGenerated?: (images: GeneratedMedia[]) => void
  defaultPrompt?: string
  businessType?: string
}

export function AIImageGenerator({ 
  onImageGenerated, 
  defaultPrompt = '',
  businessType = 'restaurant'
}: AIImageGeneratorProps) {
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<GeneratedMedia[]>([])
  const [selectedImage, setSelectedImage] = useState<GeneratedMedia | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Generation settings
  const [model, setModel] = useState('dall-e-3')
  const [style, setStyle] = useState('vivid')
  const [quality, setQuality] = useState('standard')
  const [numberOfImages, setNumberOfImages] = useState(1)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  
  // Marketing mode
  const [marketingMode, setMarketingMode] = useState(false)
  const [campaign, setCampaign] = useState('')
  const [tone, setTone] = useState('professional')
  const [platforms, setPlatforms] = useState<string[]>(['instagram'])
  
  const generator = new MediaGenerator()

  const aspectRatios = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1792, height: 1024 },
    '9:16': { width: 1024, height: 1792 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
  }

  const handleGenerate = async () => {
    if (!prompt.trim() && !marketingMode) {
      setError('Please enter a prompt')
      return
    }

    setGenerating(true)
    setError(null)

    try {
      if (marketingMode) {
        const result = await generator.generateMarketingContent({
          businessType,
          campaign: campaign || prompt,
          tone: tone as any,
          includeImages: true,
          platforms: platforms as any,
        })

        if (result.success && result.data?.images) {
          setGeneratedImages(result.data.images)
          onImageGenerated?.(result.data.images)
        } else {
          throw new Error(result.error || 'Failed to generate marketing content')
        }
      } else {
        const { width, height } = aspectRatios[aspectRatio as keyof typeof aspectRatios]
        const result = await generator.generateImage({
          prompt,
          negativePrompt,
          width,
          height,
          numberOfImages,
          style: style as any,
          quality: quality as any,
          model: model as any,
        })

        if (result.success && result.data) {
          setGeneratedImages(result.data)
          onImageGenerated?.(result.data)
        } else {
          throw new Error(result.error || 'Failed to generate images')
        }
      }
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (image: GeneratedMedia) => {
    try {
      const response = await fetch(image.url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `generated-${image.id}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      setError('Failed to download image')
    }
  }

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt)
  }

  const handleShare = async (image: GeneratedMedia) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Generated Image',
          text: prompt,
          url: image.url,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    } else {
      navigator.clipboard.writeText(image.url)
      alert('Image URL copied to clipboard!')
    }
  }

  const promptSuggestions = [
    `${businessType} interior with modern elegant design, warm lighting`,
    `Delicious gourmet ${businessType === 'restaurant' ? 'dish' : 'product'} on elegant table setting`,
    `Happy customers enjoying at ${businessType}, candid photography`,
    `${businessType} storefront at golden hour, inviting atmosphere`,
    `Professional chef preparing signature dish in modern kitchen`,
    `Cozy corner of ${businessType} with plants and natural light`,
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Image Generator
          </CardTitle>
          <CardDescription>
            Generate stunning images for your {businessType} using AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="simple" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="simple">Simple Mode</TabsTrigger>
              <TabsTrigger value="advanced">Advanced Mode</TabsTrigger>
            </TabsList>

            <TabsContent value="simple" className="space-y-4">
              <div>
                <Label htmlFor="prompt">Describe what you want to create</Label>
                <Textarea
                  id="prompt"
                  placeholder={`E.g., "${promptSuggestions[0]}"`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[100px] mt-2"
                />
              </div>

              <div>
                <Label>Quick Suggestions</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {promptSuggestions.slice(0, 3).map((suggestion, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setPrompt(suggestion)}
                    >
                      {suggestion.slice(0, 30)}...
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="marketing-mode"
                  checked={marketingMode}
                  onCheckedChange={setMarketingMode}
                />
                <Label htmlFor="marketing-mode">Marketing Mode</Label>
              </div>

              {marketingMode && (
                <div className="space-y-4 p-4 rounded-lg border">
                  <div>
                    <Label htmlFor="campaign">Campaign Theme</Label>
                    <Input
                      id="campaign"
                      placeholder="E.g., Summer Special, Grand Opening"
                      value={campaign}
                      onChange={(e) => setCampaign(e.target.value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="tone">Tone</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger id="tone" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="playful">Playful</SelectItem>
                        <SelectItem value="luxurious">Luxurious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Platforms</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {['instagram', 'facebook', 'twitter', 'linkedin'].map((platform) => (
                        <Badge
                          key={platform}
                          variant={platforms.includes(platform) ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => {
                            setPlatforms(prev =>
                              prev.includes(platform)
                                ? prev.filter(p => p !== platform)
                                : [...prev, platform]
                            )
                          }}
                        >
                          {platform}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div>
                <Label htmlFor="prompt-advanced">Prompt</Label>
                <Textarea
                  id="prompt-advanced"
                  placeholder="Describe your image in detail..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[100px] mt-2"
                />
              </div>

              <div>
                <Label htmlFor="negative-prompt">Negative Prompt (exclude these)</Label>
                <Textarea
                  id="negative-prompt"
                  placeholder="E.g., blurry, low quality, distorted..."
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  className="min-h-[60px] mt-2"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="model">AI Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger id="model" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dall-e-3">DALL-E 3</SelectItem>
                      <SelectItem value="dall-e-2">DALL-E 2</SelectItem>
                      <SelectItem value="stable-diffusion">Stable Diffusion</SelectItem>
                      <SelectItem value="midjourney">Midjourney (Beta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="style">Style</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger id="style" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vivid">Vivid</SelectItem>
                      <SelectItem value="natural">Natural</SelectItem>
                      <SelectItem value="anime">Anime</SelectItem>
                      <SelectItem value="digital-art">Digital Art</SelectItem>
                      <SelectItem value="photographic">Photographic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="quality">Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger id="quality" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="hd">HD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="aspect-ratio">Aspect Ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger id="aspect-ratio" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">Square (1:1)</SelectItem>
                      <SelectItem value="16:9">Landscape (16:9)</SelectItem>
                      <SelectItem value="9:16">Portrait (9:16)</SelectItem>
                      <SelectItem value="4:3">Standard (4:3)</SelectItem>
                      <SelectItem value="3:4">Portrait (3:4)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="number-of-images">Number of Images: {numberOfImages}</Label>
                <Slider
                  id="number-of-images"
                  min={1}
                  max={4}
                  step={1}
                  value={[numberOfImages]}
                  onValueChange={(value) => setNumberOfImages(value[0])}
                  className="mt-2"
                />
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Generate Images
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleCopyPrompt}
              disabled={!prompt}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {generatedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Images</CardTitle>
            <CardDescription>
              Click on an image to view it in full size
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {generatedImages.map((image) => (
                <div
                  key={image.id}
                  className="relative group cursor-pointer rounded-lg overflow-hidden"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="w-full h-64 object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownload(image)
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleShare(image)
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-white text-xs truncate">{image.model}</p>
                  </div>
                </div>
              ))}
            </div>

            {generatedImages.length > 0 && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setGeneratedImages([])}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={selectedImage.url}
              alt={selectedImage.prompt}
              className="max-w-full max-h-full object-contain"
            />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDownload(selectedImage)
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedImage(null)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}