import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  deleteCustomNoteFormat,
  getCustomNoteFormat,
  updateCustomNoteFormat,
} from "@/lib/db/queries";
import type { CustomNoteFormatSection } from "@/lib/db/types";

const SECTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_SECTIONS = 20;
const MAX_NAME_LENGTH = 100;
const MAX_GENERAL_RULES_LENGTH = 1000;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function validateSections(
  sections: unknown
):
  | { valid: true; parsed: CustomNoteFormatSection[] }
  | { valid: false; error: string } {
  if (!Array.isArray(sections)) {
    return { valid: false, error: "sections must be an array" };
  }

  if (sections.length === 0 || sections.length > MAX_SECTIONS) {
    return {
      valid: false,
      error: `sections must contain 1–${MAX_SECTIONS} items`,
    };
  }

  const seenKeys = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (typeof section !== "object" || section === null) {
      return { valid: false, error: `sections[${i}] must be an object` };
    }

    const { key, label, description, required } = section as Record<
      string,
      unknown
    >;

    if (typeof key !== "string" || key.length === 0) {
      return {
        valid: false,
        error: `sections[${i}].key must be a non-empty string`,
      };
    }
    if (!SECTION_KEY_PATTERN.test(key)) {
      return {
        valid: false,
        error: `sections[${i}].key must match /^[a-z][a-z0-9_]*$/`,
      };
    }
    if (seenKeys.has(key)) {
      return { valid: false, error: `Duplicate section key: "${key}"` };
    }
    seenKeys.add(key);

    if (typeof label !== "string" || label.length === 0) {
      return {
        valid: false,
        error: `sections[${i}].label must be a non-empty string`,
      };
    }
    if (typeof description !== "string" || description.length === 0) {
      return {
        valid: false,
        error: `sections[${i}].description must be a non-empty string`,
      };
    }
    if (typeof required !== "boolean") {
      return {
        valid: false,
        error: `sections[${i}].required must be a boolean`,
      };
    }
  }

  return {
    valid: true,
    parsed: sections as CustomNoteFormatSection[],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const format = await getCustomNoteFormat({
      id,
      therapistId: session.user.id,
    });

    if (!format) {
      return NextResponse.json(
        { error: "Custom note format not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(format);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch custom note format" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  try {
    const existing = await getCustomNoteFormat({
      id,
      therapistId: session.user.id,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Custom note format not found" },
        { status: 404 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify custom note format" },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, sections, generalRules } = body;

  const updates: Record<string, unknown> = {};

  // Validate name if provided
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 }
      );
    }
    const trimmedName = name.trim();
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `name must be ${MAX_NAME_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }
    updates.name = trimmedName;
    updates.slug = generateSlug(trimmedName);
  }

  // Validate sections if provided
  if (sections !== undefined) {
    const sectionsResult = validateSections(sections);
    if (!sectionsResult.valid) {
      return NextResponse.json(
        { error: sectionsResult.error },
        { status: 400 }
      );
    }
    updates.sections = sectionsResult.parsed;
  }

  // Validate generalRules if provided
  if (generalRules !== undefined) {
    if (generalRules !== null && typeof generalRules !== "string") {
      return NextResponse.json(
        { error: "generalRules must be a string or null" },
        { status: 400 }
      );
    }
    if (
      typeof generalRules === "string" &&
      generalRules.length > MAX_GENERAL_RULES_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `generalRules must be ${MAX_GENERAL_RULES_LENGTH} characters or fewer`,
        },
        { status: 400 }
      );
    }
    updates.generalRules = generalRules;
  }

  try {
    const updated = await updateCustomNoteFormat({
      id,
      therapistId: session.user.id,
      updates,
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Failed to update custom note format" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  try {
    const existing = await getCustomNoteFormat({
      id,
      therapistId: session.user.id,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Custom note format not found" },
        { status: 404 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify custom note format" },
      { status: 500 }
    );
  }

  try {
    await deleteCustomNoteFormat({ id, therapistId: session.user.id });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete custom note format" },
      { status: 500 }
    );
  }
}
