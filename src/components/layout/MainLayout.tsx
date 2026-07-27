import type { ReactNode } from "react";

type MainLayoutProps = {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
};

export default function MainLayout({
  header,
  sidebar,
  children,
}: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {header}

      <div className="flex min-h-0 flex-1">
        {sidebar}

        <main className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
