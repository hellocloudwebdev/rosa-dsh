import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION || "ap-southeast-1";

console.log("Testing Neon Object Storage with endpoint:", endpoint);

const s3 = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

async function main() {
  const bucket = "assets";
  const key = "test/greeting.txt";
  const content = "Hello from Neon Object Storage!";

  console.log(`1. Uploading to ${bucket}/${key}...`);
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(content),
    ContentType: "text/plain",
  }));
  console.log("   Uploaded successfully.");

  console.log(`2. Downloading ${bucket}/${key}...`);
  const getRes = await s3.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
  const downloaded = await getRes.Body.transformToString();
  console.log("   Downloaded content:", downloaded);
  if (downloaded !== content) throw new Error("Content mismatch!");

  console.log(`3. Listing objects in ${bucket}...`);
  const listRes = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: "test/",
  }));
  console.log("   Objects found:", listRes.Contents?.map(c => c.Key));

  console.log(`4. Generating presigned URL for ${bucket}/${key}...`);
  const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  console.log("   Presigned URL generated:", signedUrl.slice(0, 60) + "...");

  console.log(`5. Deleting ${bucket}/${key}...`);
  await s3.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  }));
  console.log("   Deleted successfully.");

  console.log("ALL STORAGE TESTS PASSED!");
}

main().catch(err => {
  console.error("Storage test failed:", err);
  process.exit(1);
});
