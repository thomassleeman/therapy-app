import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";

export default async function AboutSettingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">About</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Platform information, professional standards, and contact details.
      </p>

      <div className="space-y-6">
        {/* Platform Information */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Platform
                </dt>
                <dd className="text-sm mt-0.5">Soundboard</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Version
                </dt>
                <dd className="text-sm mt-0.5">0.1.0 (Beta)</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Built by
                </dt>
                <dd className="text-sm mt-0.5">
                  Built with care for therapists in the UK and Ireland
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Professional Standards */}
        <Card>
          <CardHeader>
            <CardTitle>Professional Standards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This platform is designed in alignment with the ethical frameworks
              and AI guidance published by UK and Irish professional bodies.
            </p>

            <ul className="space-y-4">
              <li>
                <p className="text-sm font-semibold">BACP</p>
                <p className="text-sm text-muted-foreground">
                  British Association for Counselling and Psychotherapy.
                  Signatory to the Shared AI Charter for UK Counselling and
                  Psychotherapy.
                </p>
              </li>
              <li>
                <p className="text-sm font-semibold">UKCP</p>
                <p className="text-sm text-muted-foreground">
                  UK Council for Psychotherapy. Advocates for thoughtful AI
                  integration in psychotherapy practice.
                </p>
              </li>
              <li>
                <p className="text-sm font-semibold">NCPS</p>
                <p className="text-sm text-muted-foreground">
                  National Counselling and Psychotherapy Society. Published the
                  UK&apos;s first Relational Safeguards framework for AI mental
                  health tools.
                </p>
              </li>
              <li>
                <p className="text-sm font-semibold">IACP</p>
                <p className="text-sm text-muted-foreground">
                  Irish Association for Counselling and Psychotherapy.
                </p>
              </li>
            </ul>

            <p className="text-sm text-muted-foreground mt-4">
              We are committed to meeting the standards these bodies set for AI
              tools in therapeutic practice.
            </p>
          </CardContent>
        </Card>

        {/* Data Protection */}
        <Card>
          <CardHeader>
            <CardTitle>Data Protection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>
                Registered with the ICO (UK Information Commissioner&apos;s
                Office):{" "}
                <span className="text-muted-foreground">
                  Registration pending
                </span>
              </p>
              <p>
                Compliant with UK GDPR, the Data Protection Act 2018, and the
                Data (Use and Access) Act 2025.
              </p>
            </div>

            <Link
              className="inline-flex items-center text-sm font-medium text-primary hover:underline mt-4"
              href="/settings/privacy"
            >
              View our full data protection details →
            </Link>
          </CardContent>
        </Card>

        {/* Contact & Support */}
        <Card>
          <CardHeader>
            <CardTitle>Contact & Support</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>
                Email:{" "}
                <span className="text-muted-foreground">
                  contact@pasuhealth.com
                </span>
              </p>
              <p className="text-muted-foreground">
                For clinical content questions or feedback, contact us using the
                link above.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
