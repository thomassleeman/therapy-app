import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  countCustomNoteFormats,
  createCustomNoteFormat,
  getCustomNoteFormats,
} from "@/lib/db/queries";
import type { CustomNoteFormatSection } from "@/lib/db/types";

const SECTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_CUSTOM_FORMATS = 10;
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

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formats = await getCustomNoteFormats({
      therapistId: session.user.id,
    });
    return NextResponse.json(formats);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch custom note formats" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, sections, generalRules } = body;

  // Validate name
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name is required and must be a non-empty string" },
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

  // Validate sections
  const sectionsResult = validateSections(sections);
  if (!sectionsResult.valid) {
    return NextResponse.json({ error: sectionsResult.error }, { status: 400 });
  }

  // Validate generalRules
  if (generalRules !== undefined && generalRules !== null) {
    if (typeof generalRules !== "string") {
      return NextResponse.json(
        { error: "generalRules must be a string" },
        { status: 400 }
      );
    }
    if (generalRules.length > MAX_GENERAL_RULES_LENGTH) {
      return NextResponse.json(
        {
          error: `generalRules must be ${MAX_GENERAL_RULES_LENGTH} characters or fewer`,
        },
        { status: 400 }
      );
    }
  }

  try {
    // Check limit
    const count = await countCustomNoteFormats({
      therapistId: session.user.id,
    });
    if (count >= MAX_CUSTOM_FORMATS) {
      return NextResponse.json(
        { error: "Maximum of 10 custom formats reached" },
        { status: 400 }
      );
    }

    const slug = generateSlug(trimmedName);

    const created = await createCustomNoteFormat({
      therapistId: session.user.id,
      name: trimmedName,
      slug,
      sections: sectionsResult.parsed,
      generalRules: typeof generalRules === "string" ? generalRules : null,
    });

    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create custom note format" },
      { status: 500 }
    );
  }
}
