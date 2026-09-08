// app/(auth)/entry.tsx — the frame every entry screen shares (screen records
// Reset password, Set new password, No membership, …): the MGR mark, a title,
// then the one form or message, centered like the sign-in card.
import { MgrIcon } from "@/components/mgr-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function Entry({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <MgrIcon size={40} className="mx-auto" />
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </div>
  );
}
