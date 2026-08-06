import { cn } from "@/lib/utils";

interface RichTextContentProps {
  content: string | null | undefined;
  className?: string;
  prose?: boolean;
}

/**
 * Component to safely render HTML content from CKEditor
 * Supports both plain text (legacy) and HTML content
 */
const RichTextContent = ({ 
  content, 
  className,
  prose = true 
}: RichTextContentProps) => {
  if (!content) {
    return null;
  }

  // Check if content contains HTML tags
  const isHTML = /<[a-z][\s\S]*>/i.test(content);

  if (isHTML) {
    // Render HTML content
    return (
      <div
        className={cn(
          prose && "prose prose-sm max-w-none",
          className
        )}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  } else {
    // Render plain text (legacy format)
    return (
      <div className={cn(prose && "prose prose-sm max-w-none", className)}>
        {content.split("\n").map((line, index) => (
          line.trim() && (
            <p key={index} className="text-muted-foreground mb-2">
              {line}
            </p>
          )
        ))}
      </div>
    );
  }
};

export default RichTextContent;

