import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { uploadService } from "@/data/uploads";

export function useFileUrl(fileKey: string | null | undefined) {
	return useQuery({
		queryKey: ["file-url", fileKey],
		queryFn: () => uploadService.getUrl(fileKey ?? ""),
		enabled: Boolean(fileKey),
		staleTime: 60_000,
	});
}

export function FilePreview({
	fileKey,
	contentType,
	alt,
	className,
}: {
	fileKey: string;
	contentType?: string;
	alt: string;
	className?: string;
}) {
	const { data: url } = useFileUrl(fileKey);
	if (!url) {
		return (
			<span className={cn("bg-secondary/70 block animate-pulse", className)} />
		);
	}
	if (contentType?.startsWith("video/")) {
		return (
			<video
				src={url}
				aria-label={alt}
				controls
				className={cn("object-cover", className)}
			>
				<track kind="captions" />
			</video>
		);
	}
	if (contentType === "application/pdf") {
		return (
			<span
				role="img"
				aria-label={alt}
				className={cn(
					"bg-background text-muted-foreground flex items-center justify-center",
					className,
				)}
			>
				<FileText aria-hidden className="size-6" />
			</span>
		);
	}
	return <img src={url} alt={alt} className={cn("object-cover", className)} />;
}
