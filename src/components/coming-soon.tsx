import { Construction } from "lucide-react";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Coming soon</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This section is under construction.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
