/**
 * Admin Album SEO Review Page (V4.9 Final)
 * Route: /admin/albums/:id/seo-review
 *
 * Allows admin to:
 * 1. View AI-generated SEO fields
 * 2. Edit any field before publishing
 * 3. Run quality check (uniqueness, keyword spam, tag count)
 * 4. Approve + publish in one click
 * 5. Regenerate SEO if needed
 */

import { useState, useEffect } from "react";
import AdminLayout from "./AdminLayout";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Loader2,
  Eye,
  Send,
} from "lucide-react";

export default function AdminAlbumSeoReview() {
  const [, params] = useRoute("/admin/albums/:id/seo-review");
  const [, navigate] = useLocation();
  const albumId = parseInt(params?.id || "0", 10);

  const [seoData, setSeoData] = useState({
    title: "",
    seoTitle: "",
    seoDescription: "",
    shortDescription: "",
    focusKeyword: "",
    relatedKeywords: [] as string[],
    tags: [] as string[],
    altTextTemplate: "",
  });

  const [relatedKwInput, setRelatedKwInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [qualityResult, setQualityResult] = useState<{
    passed: boolean;
    warnings: string[];
    errors: string[];
    duplicates: Array<{ field: string; albumId: number; albumSlug: string; similarity: number }>;
  } | null>(null);

  // Fetch album data
  const { data: album, isLoading: albumLoading } = trpc.albums.byId.useQuery(
    { id: albumId },
    { enabled: albumId > 0 }
  );

  // Populate form when album loads
  useEffect(() => {
    if (album) {
      let tags: string[] = [];
      let relatedKw: string[] = [];
      try {
        if (album.tags) tags = JSON.parse(album.tags);
      } catch { /* ignore */ }
      try {
        if (album.relatedKeywords) relatedKw = JSON.parse(album.relatedKeywords);
      } catch { /* ignore */ }

      setSeoData({
        title: album.title || "",
        seoTitle: album.seoTitle || "",
        seoDescription: album.seoDescription || "",
        shortDescription: album.shortDescription || "",
        focusKeyword: album.focusKeyword || "",
        relatedKeywords: relatedKw,
        tags,
        altTextTemplate: album.altTextTemplate || "",
      });
      setTagsInput(tags.join(", "));
      setRelatedKwInput(relatedKw.join(", "));
    }
  }, [album]);

  // Quality check
  const checkQuality = trpc.zipImport.checkSeoQuality.useQuery(
    { albumId },
    { enabled: false }
  );

  const handleCheckQuality = async () => {
    const result = await checkQuality.refetch();
    if (result.data) {
      setQualityResult(result.data);
    }
  };

  // Regenerate SEO
  const regenerateMutation = trpc.zipImport.regenerateSeo.useMutation({
    onSuccess: (data) => {
      setSeoData({
        title: data.title || seoData.title,
        seoTitle: data.seoTitle || data.metaTitle || "",
        seoDescription: data.seoDescription || data.metaDescription || "",
        shortDescription: data.shortDescription || "",
        focusKeyword: data.focusKeyword || "",
        relatedKeywords: data.relatedKeywords || [],
        tags: data.tags || [],
        altTextTemplate: data.altTextTemplate || "",
      });
      setTagsInput((data.tags || []).join(", "));
      setRelatedKwInput((data.relatedKeywords || []).join(", "));
      setQualityResult(null);
      toast.success("SEO đã được tạo lại bằng AI");
    },
    onError: (err) => toast.error(`Lỗi: ${err.message}`),
  });

  // Approve + publish
  const approveMutation = trpc.zipImport.approveSeoAndPublish.useMutation({
    onSuccess: (data) => {
      if (data.warnings.length > 0) {
        toast.warning(`Đã publish với ${data.warnings.length} cảnh báo`);
      } else {
        toast.success("Album đã được publish thành công!");
      }
      navigate("/admin/albums");
    },
    onError: (err) => toast.error(`Không thể publish: ${err.message}`),
  });

  const handleApprove = () => {
    // Parse tags and relatedKeywords from input
    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const parsedRelatedKw = relatedKwInput
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    approveMutation.mutate({
      albumId,
      seoData: {
        title: seoData.title,
        metaTitle: seoData.seoTitle,
        metaDescription: seoData.seoDescription,
        shortDescription: seoData.shortDescription,
        focusKeyword: seoData.focusKeyword,
        altTextTemplate: seoData.altTextTemplate,
        tags: parsedTags,
        relatedKeywords: parsedRelatedKw,
      },
    });
  };

  if (albumLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Album không tồn tại.
      </div>
    );
  }

  const charCount = {
    seoTitle: seoData.seoTitle.length,
    seoDescription: seoData.seoDescription.length,
  };

  return (
    <AdminLayout>
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/zip-import")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Quay lại
        </Button>
        <div>
          <h1 className="text-2xl font-bold">SEO Review</h1>
          <p className="text-sm text-muted-foreground">
            Album: <span className="font-medium">{album.title}</span>
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateMutation.mutate({ albumId })}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-1" />
            )}
            Tạo lại SEO
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckQuality}
            disabled={checkQuality.isFetching}
          >
            {checkQuality.isFetching ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-1" />
            )}
            Kiểm tra chất lượng
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            Approve & Publish
          </Button>
        </div>
      </div>

      {/* Quality Check Result */}
      {qualityResult && (
        <Card
          className={
            qualityResult.passed
              ? "border-green-500"
              : "border-red-500"
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {qualityResult.passed ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              {qualityResult.passed
                ? "SEO đạt chất lượng"
                : "SEO chưa đạt — cần sửa trước khi publish"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {qualityResult.errors.map((e, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {e}
              </div>
            ))}
            {qualityResult.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-amber-600">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {w}
              </div>
            ))}
            {qualityResult.duplicates.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Trùng lặp phát hiện:
                </p>
                <div className="flex flex-wrap gap-1">
                  {qualityResult.duplicates.map((d, i) => (
                    <Badge key={i} variant="destructive" className="text-xs">
                      {d.field}: #{d.albumId} ({Math.round(d.similarity * 100)}%)
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SEO Form */}
      <div className="grid grid-cols-1 gap-6">
        {/* Title */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tiêu đề Album</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={seoData.title}
              onChange={(e) => setSeoData({ ...seoData, title: e.target.value })}
              placeholder="Tiêu đề hiển thị"
            />
          </CardContent>
        </Card>

        {/* SEO Title */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              SEO Title
              <span
                className={`text-xs font-normal ${
                  charCount.seoTitle > 60
                    ? "text-red-500"
                    : charCount.seoTitle > 50
                    ? "text-amber-500"
                    : "text-muted-foreground"
                }`}
              >
                {charCount.seoTitle}/60
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={seoData.seoTitle}
              onChange={(e) => setSeoData({ ...seoData, seoTitle: e.target.value })}
              placeholder="SEO title (50-60 ký tự)"
            />
          </CardContent>
        </Card>

        {/* SEO Description */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Meta Description
              <span
                className={`text-xs font-normal ${
                  charCount.seoDescription > 160
                    ? "text-red-500"
                    : charCount.seoDescription > 140
                    ? "text-amber-500"
                    : "text-muted-foreground"
                }`}
              >
                {charCount.seoDescription}/160
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={seoData.seoDescription}
              onChange={(e) =>
                setSeoData({ ...seoData, seoDescription: e.target.value })
              }
              placeholder="Meta description (120-160 ký tự)"
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Short Description */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Short Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={seoData.shortDescription}
              onChange={(e) =>
                setSeoData({ ...seoData, shortDescription: e.target.value })
              }
              placeholder="Mô tả ngắn hiển thị trên trang album (2-3 câu)"
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Focus Keyword */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Focus Keyword</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={seoData.focusKeyword}
              onChange={(e) =>
                setSeoData({ ...seoData, focusKeyword: e.target.value })
              }
              placeholder="Từ khóa chính (1-3 từ)"
            />
          </CardContent>
        </Card>

        {/* Related Keywords */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Related Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={relatedKwInput}
              onChange={(e) => setRelatedKwInput(e.target.value)}
              placeholder="Từ khóa liên quan, cách nhau bằng dấu phẩy"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {relatedKwInput.split(",").filter((k) => k.trim()).length} từ khóa
            </p>
          </CardContent>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tags (5-8 tags)</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3, ..."
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {tagsInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
            </div>
            <p
              className={`text-xs mt-1 ${
                tagsInput.split(",").filter((t) => t.trim()).length < 5 ||
                tagsInput.split(",").filter((t) => t.trim()).length > 8
                  ? "text-red-500"
                  : "text-muted-foreground"
              }`}
            >
              {tagsInput.split(",").filter((t) => t.trim()).length} tags (cần 5-8)
            </p>
          </CardContent>
        </Card>

        {/* Alt Text Template */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alt Text Template</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={seoData.altTextTemplate}
              onChange={(e) =>
                setSeoData({ ...seoData, altTextTemplate: e.target.value })
              }
              placeholder="{creator} {albumTitle} photo {number}"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Dùng {"{creator}"}, {"{albumTitle}"}, {"{number}"} làm placeholder
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Bottom Actions */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => navigate("/admin/zip-import")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Quay lại Import
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleCheckQuality}
            disabled={checkQuality.isFetching}
          >
            {checkQuality.isFetching ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Eye className="w-4 h-4 mr-1" />
            )}
            Kiểm tra chất lượng
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approveMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {approveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1" />
            )}
            Approve & Publish
          </Button>
        </div>
      </div>
    </div>
    </AdminLayout>
  );
}
