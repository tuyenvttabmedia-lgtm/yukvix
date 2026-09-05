/**
 * RichTextEditor — TipTap-based WYSIWYG editor for CMS pages.
 * Supports: bold, italic, underline, headings, lists, links, blockquote, code, align, undo/redo.
 */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Code2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Undo,
  Redo,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  tooltip,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={isActive}
            onPressedChange={() => onClick()}
            disabled={disabled}
            className={cn(
              "h-7 w-7 p-0 rounded",
              isActive && "bg-primary/20 text-primary"
            )}
          >
            {children}
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Nhập nội dung...",
  className,
  minHeight = "300px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline cursor-pointer" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "cms-prose max-w-none focus:outline-none text-foreground"
        ),
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes (e.g. when switching language tabs)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value ?? "");
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL:", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden bg-background", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-muted/30">
        {/* History */}
        <ToolbarButton
          tooltip="Hoàn tác (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Làm lại (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton
          tooltip="Tiêu đề 1"
          isActive={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Tiêu đề 2"
          isActive={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Tiêu đề 3"
          isActive={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Inline formatting */}
        <ToolbarButton
          tooltip="In đậm (Ctrl+B)"
          isActive={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="In nghiêng (Ctrl+I)"
          isActive={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Gạch chân (Ctrl+U)"
          isActive={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Gạch ngang"
          isActive={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Code inline"
          isActive={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          tooltip="Danh sách dấu chấm"
          isActive={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Danh sách đánh số"
          isActive={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Trích dẫn"
          isActive={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Khối code"
          isActive={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code2 className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Alignment */}
        <ToolbarButton
          tooltip="Căn trái"
          isActive={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Căn giữa"
          isActive={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Căn phải"
          isActive={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Căn đều"
          isActive={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </ToolbarButton>

        <Divider />

        {/* Link */}
        <ToolbarButton
          tooltip="Chèn liên kết"
          isActive={editor.isActive("link")}
          onClick={setLink}
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          tooltip="Đường kẻ ngang"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} className="cms-prose-host" />
    </div>
  );
}
