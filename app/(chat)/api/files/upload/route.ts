import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 5 * 1024 * 1024, {
      message: "File size should be less than 5MB",
    })
    // Update the file type based on the kind of files you want to accept
    .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
      message: "File type should be JPEG or PNG",
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get("file") as File).name;
    const fileBuffer = await file.arrayBuffer();

    try {
      const supabase = await createClient();

      // Generate a unique path with user ID to enforce RLS
      const filePath = `${session.user.id}/${Date.now()}-${filename}`;

      const { data, error } = await supabase.storage
        .from("uploads")
        .upload(filePath, fileBuffer, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("Supabase storage upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      // Get the public URL for the uploaded file
      const { data: { publicUrl } } = supabase.storage
        .from("uploads")
        .getPublicUrl(data.path);

      return NextResponse.json({
        url: publicUrl,
        pathname: data.path,
        contentType: file.type,
      });
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
