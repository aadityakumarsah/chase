import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading } from "@/components/page-heading";
export function ComingSoon({
  eyebrow,
  title,
  description,
  part,
}: {
  eyebrow: string;
  title: string;
  description: string;
  part: number;
}) {
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading eyebrow={eyebrow} title={title} description={description} />
      <Card className="border-dashed shadow-none">
        <CardContent className="grid min-h-[420px] place-items-center text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles />
            </span>
            <h2 className="mt-5 text-xl font-semibold">
              Ready for Part {part}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              The navigation and data surface are in place. The generation,
              approval and delivery workflow arrives in the next dedicated part.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">
              Dashboard foundation complete <ArrowRight size={15} />
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
