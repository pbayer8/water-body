import { SegmentationDemo } from "@/components/SegmentationDemo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <SegmentationDemo />
    </div>
  );
}
