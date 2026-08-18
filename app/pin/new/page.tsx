import PinForm from "@/components/PinForm";
import PageHeader from "@/components/PageHeader";

export default async function NewPinPage({
  searchParams,
}: {
  searchParams: Promise<{
    lat?: string;
    lng?: string;
    address?: string;
    name?: string;
    parkingInfo?: string;
    shootingSpots?: string;
    ipTransmissionInfo?: string;
    fpuInfo?: string;
    hazards?: string;
  }>;
}) {
  const {
    lat,
    lng,
    address,
    name,
    parkingInfo,
    shootingSpots,
    ipTransmissionInfo,
    fpuInfo,
    hazards,
  } = await searchParams;
  const initialPosition =
    lat && lng ? { lat: parseFloat(lat), lng: parseFloat(lng) } : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="現場を登録" />
      <PinForm
        initialPosition={initialPosition}
        initialAddress={address ?? ""}
        initialName={name ?? ""}
        initialParkingInfo={parkingInfo ?? ""}
        initialShootingSpots={shootingSpots ?? ""}
        initialIpTransmissionInfo={ipTransmissionInfo ?? ""}
        initialFpuInfo={fpuInfo ?? ""}
        initialHazards={hazards ?? ""}
      />
    </div>
  );
}
