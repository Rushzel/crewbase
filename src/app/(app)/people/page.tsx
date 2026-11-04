import { redirect } from "next/navigation";

// The live board moved into Team today, with statuses and the map.
export default function PeoplePage() {
  redirect("/team");
}
