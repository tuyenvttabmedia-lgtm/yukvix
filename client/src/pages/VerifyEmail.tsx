import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link, useSearch } from "wouter";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function VerifyEmail() {
  const { t } = useTranslation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const verifyMutation = trpc.authEmail.verifyEmail.useMutation();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("verifyEmail.noToken"));
      return;
    }

    verifyMutation.mutate(
      { token },
      {
        onSuccess: (data) => {
          setStatus("success");
          setMessage(data.message);
        },
        onError: (err) => {
          setStatus("error");
          setMessage(err.message);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">{t("verifyEmail.verifying")}</h1>
            <p className="text-muted-foreground">{t("verifyEmail.verifyingDesc")}</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t("verifyEmail.successTitle")}</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="pt-4">
              <Link href="/">
                <Button>{t("common.goHome")}</Button>
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">{t("verifyEmail.failedTitle")}</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="pt-4 flex gap-3 justify-center">
              <Link href="/account">
                <Button variant="outline">
                  <Mail className="w-4 h-4 mr-2" />
                  {t("verifyEmail.resend")}
                </Button>
              </Link>
              <Link href="/">
                <Button>{t("common.goHome")}</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
