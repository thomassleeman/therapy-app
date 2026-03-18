import {
  AlignmentType,
  convertMillimetersToTwip,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Tab,
  TabStopPosition,
  TabStopType,
  TextRun,
} from "docx";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getClinicalDocument } from "@/lib/db/queries";
import {
  type ClinicalDocumentType,
  DOCUMENT_TYPE_REGISTRY,
} from "@/lib/documents/types";

function formatDateUK(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildDocx({
  doc,
  typeLabel,
  clientIdentifier,
  finalisedAt,
}: {
  doc: {
    documentType: ClinicalDocumentType;
    title: string;
    content: Record<string, string>;
    status: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  typeLabel: string;
  clientIdentifier: string;
  finalisedAt: string | null;
}): Document {
  const typeConfig = DOCUMENT_TYPE_REGISTRY[doc.documentType];
  const margin = convertMillimetersToTwip(25);

  const footerText =
    doc.status === "finalised" && finalisedAt
      ? `Finalised on ${formatDateUK(finalisedAt)}`
      : "Draft \u2014 requires clinical review";

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: doc.title,
          bold: true,
          size: 32, // 16pt
          font: "Arial",
        }),
      ],
      spacing: { after: 120 },
    })
  );

  // Document type + status line
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${typeLabel} \u2014 ${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}`,
          size: 22,
          font: "Arial",
          color: "666666",
        }),
        ...(doc.version > 1
          ? [
              new TextRun({
                text: ` (v${doc.version})`,
                size: 22,
                font: "Arial",
                color: "666666",
              }),
            ]
          : []),
      ],
      spacing: { after: 200 },
    })
  );

  // Metadata block
  const metadataLines = [
    `Client: ${clientIdentifier}`,
    `Document created: ${formatDateUK(doc.createdAt)}`,
    `Version: ${doc.version}`,
  ];

  for (const line of metadataLines) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            size: 20, // 10pt
            font: "Arial",
            color: "555555",
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 200 },
      border: {
        bottom: { style: "single" as const, size: 1, color: "CCCCCC" },
      },
    })
  );

  // Content sections
  for (const sectionDef of typeConfig.sections) {
    const text = doc.content[sectionDef.key];
    if (!text) continue;

    // Section heading
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: sectionDef.label,
            bold: true,
            size: 28, // 14pt
            font: "Arial",
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      })
    );

    // Section body — split by paragraph
    const paragraphs = text.split(/\n\n+/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      // Handle simple bullet points
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const bulletLines = trimmed.split("\n");
        for (const bulletLine of bulletLines) {
          const cleaned = bulletLine.replace(/^[-*]\s+/, "").trim();
          if (!cleaned) continue;
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `\u2022  ${cleaned}`,
                  size: 22, // 11pt
                  font: "Arial",
                }),
              ],
              indent: { left: convertMillimetersToTwip(8) },
              spacing: { after: 60 },
            })
          );
        }
      } else {
        // Regular paragraph — preserve inline line breaks as single paragraph
        const lines = trimmed.split("\n");
        const runs: TextRun[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (i > 0) {
            runs.push(new TextRun({ break: 1 }));
          }
          runs.push(
            new TextRun({
              text: lines[i].trim(),
              size: 22, // 11pt
              font: "Arial",
            })
          );
        }
        children.push(
          new Paragraph({
            children: runs,
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210), // A4
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: margin,
              right: margin,
              bottom: margin,
              left: margin,
            },
            pageNumbers: { start: 1 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Soundboard",
                    size: 16, // 8pt
                    font: "Arial",
                    color: "999999",
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Generated by Soundboard \u00B7 ${footerText}`,
                    size: 16,
                    font: "Arial",
                    color: "999999",
                  }),
                  new TextRun({
                    children: [new Tab(), "Page ", PageNumber.CURRENT],
                    size: 16,
                    font: "Arial",
                    color: "999999",
                  }),
                ],
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: TabStopPosition.MAX,
                  },
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
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
    const doc = await getClinicalDocument({
      id,
      therapistId: session.user.id,
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    if (doc.status !== "reviewed" && doc.status !== "finalised") {
      return NextResponse.json(
        { error: "Only reviewed or finalised documents can be exported" },
        { status: 400 }
      );
    }

    const typeConfig = DOCUMENT_TYPE_REGISTRY[doc.documentType];
    if (!typeConfig) {
      return NextResponse.json(
        { error: "Unknown document type" },
        { status: 400 }
      );
    }

    const clientIdentifier = `Client ${doc.clientId.substring(0, 6).toUpperCase()}`;

    const document = buildDocx({
      doc,
      typeLabel: typeConfig.label,
      clientIdentifier,
      finalisedAt: doc.finalisedAt,
    });

    const buffer = await Packer.toBuffer(document);
    const dateStr = new Date(doc.createdAt).toISOString().split("T")[0];
    const filename = `${doc.documentType.replace(/_/g, "-")}-${dateStr}.docx`;

    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Document export failed:", error);
    return NextResponse.json(
      { error: "Failed to export document" },
      { status: 500 }
    );
  }
}
