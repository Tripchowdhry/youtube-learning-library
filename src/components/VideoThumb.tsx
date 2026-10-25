import { thumbnailUrl } from "@/lib/youtube";

type Props = {
  video: { url: string; youtube_id: string; title: string | null; thumbnail_url: string | null };
};

export default function VideoThumb({ video }: Props) {
  return (
    <a href={video.url} target="_blank" rel="noreferrer" className="block aspect-video bg-slate-200" draggable={false}>
      <img
        src={video.thumbnail_url ?? thumbnailUrl(video.youtube_id)}
        alt={video.title ?? "YouTube video"}
        className="h-full w-full object-cover"
        loading="lazy"
        draggable={false}
      />
    </a>
  );
}
