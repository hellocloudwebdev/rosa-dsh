/**
 * Neon Object Storage Client.
 *
 * S3-compatible file storage that branches alongside Lakebase Postgres.
 * Built with @aws-sdk/client-s3 and configured with forcePathStyle: true.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiEnv } from "../env.js";

export interface NeonStorageService {
  readonly s3: S3Client;
  upload(
    bucket: string,
    key: string,
    body: Uint8Array | string,
    contentType?: string,
  ): Promise<void>;
  download(bucket: string, key: string): Promise<Uint8Array | null>;
  list(bucket: string, prefix?: string): Promise<Array<{ key?: string; size?: number }>>;
  delete(bucket: string, key: string): Promise<void>;
  getPresignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
}

export function createNeonStorageClient(env: ApiEnv): NeonStorageService | null {
  const endpoint = env.AWS_ENDPOINT_URL_S3;
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  const region = env.AWS_REGION || "ap-southeast-1";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const s3 = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // required: Neon uses path-style addressing
  });

  return {
    s3,
    async upload(
      bucket: string,
      key: string,
      body: Uint8Array | string,
      contentType?: string,
    ): Promise<void> {
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType ?? "application/octet-stream",
        }),
      );
    },
    async download(bucket: string, key: string): Promise<Uint8Array | null> {
      try {
        const res = await s3.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        if (!res.Body) return null;
        return await res.Body.transformToByteArray();
      } catch {
        return null;
      }
    },
    async list(bucket: string, prefix?: string) {
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
        }),
      );
      return (res.Contents ?? []).map((item) => ({
        key: item.Key,
        size: item.Size,
      }));
    },
    async delete(bucket: string, key: string): Promise<void> {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
    async getPresignedUrl(bucket: string, key: string, expiresIn = 3600): Promise<string> {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn },
      );
    },
  };
}
