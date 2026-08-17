import PinForm from "@/components/PinForm";
import PageHeader from "@/components/PageHeader";

export default async function NewPinPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string; address?: string }>;
}) {
  const { lat, lng, address } = await searchParams;
  const initialPosition =
    lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="現場を登録" />
      <PinForm initialPosition={initialPosition} initialAddress={address ?? ""} />
    </div>
  );
}
