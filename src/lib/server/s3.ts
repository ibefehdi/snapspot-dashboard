import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { getConfig, isGallerySyncEnabled } from './config'

let s3Client: S3Client | null = null

function getS3Client(): S3Client | null {
  if (!isGallerySyncEnabled()) return null
  if (!s3Client) {
    const cfg = getConfig()
    s3Client = new S3Client({
      region: cfg.AWS_REGION,
      credentials: cfg.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: cfg.AWS_ACCESS_KEY_ID,
            secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    })
  }
  return s3Client
}

export function sanitizeJourneyId(journeyId: string): string {
  return journeyId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function buildMontageKey(host: string, journeyId: string): string {
  const cfg = getConfig()
  const safeJourney = sanitizeJourneyId(journeyId)
  const key = `${host}/${safeJourney}.png`
  if (cfg.S3_PREFIX) {
    const prefix = cfg.S3_PREFIX.replace(/\/$/, '')
    return `${prefix}/${key}`
  }
  return key
}

export async function montageExists(host: string, journeyId: string): Promise<boolean> {
  const client = getS3Client()
  if (!client) return false
  const cfg = getConfig()
  try {
    await client.send(new HeadObjectCommand({
      Bucket: cfg.S3_BUCKET,
      Key: buildMontageKey(host, journeyId),
    }))
    return true
  }
  catch {
    return false
  }
}

export async function uploadMontage(
  host: string,
  journeyId: string,
  body: Buffer,
): Promise<string | undefined> {
  const client = getS3Client()
  if (!client) throw new Error('S3 not configured')
  const cfg = getConfig()
  const result = await client.send(new PutObjectCommand({
    Bucket: cfg.S3_BUCKET,
    Key: buildMontageKey(host, journeyId),
    Body: body,
    ContentType: 'image/png',
  }))
  return result.ETag?.replace(/"/g, '')
}

export async function getMontageStream(
  host: string,
  journeyId: string,
): Promise<Readable | null> {
  const client = getS3Client()
  if (!client) return null
  const cfg = getConfig()
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: cfg.S3_BUCKET,
      Key: buildMontageKey(host, journeyId),
    }))
    if (!result.Body) return null
    return result.Body as Readable
  }
  catch {
    return null
  }
}
