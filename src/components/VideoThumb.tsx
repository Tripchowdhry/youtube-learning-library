import { thumbnailUrl } from "@/lib/youtube";

type Props = {
  video: {
    url: string;
    youtube_id: string;
    title: string | null;
    thumbnail_url: string | null;
  };
  // Where clicking goes. Defaults to the video on YouTube.
  href?: string;
};

export default function VideoThumb({ video, href }: Props) {
  const external = !href;
  return (
    <a
      href={href ?? video.url}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="block aspect-video bg-slate-200"
      draggable={false}
    >
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
