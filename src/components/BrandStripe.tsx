// A thin band in the four colours of the BrainShelf logo's books, like a row of spines on a shelf.
export default function BrandStripe() {
  return (
    <div className="flex h-1" aria-hidden>
      <span className="flex-1 bg-[#2563eb]" />
      <span className="flex-1 bg-[#16a34a]" />
      <span className="flex-1 bg-[#dc2626]" />
      <span className="flex-1 bg-[#f59e0b]" />
    </div>
  );
}
