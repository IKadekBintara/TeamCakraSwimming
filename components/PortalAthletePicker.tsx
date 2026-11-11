import Link from "next/link";

type Athlete = { id: string; full_name: string };

export default function PortalAthletePicker({ athletes, selected, path }: {
  athletes: Athlete[];
  selected: string;
  path: string;
}) {
  if (athletes.length <= 1) return null;
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Pilih atlet">
      {athletes.map((athlete) => (
        <Link key={athlete.id} href={`${path}?atlet=${athlete.id}`}
          className={athlete.id === selected ? "btn-primary" : "btn-secondary"}
          aria-current={athlete.id === selected ? "page" : undefined}>
          {athlete.full_name}
        </Link>
      ))}
    </nav>
  );
}
