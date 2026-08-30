import { permanentRedirect } from "next/navigation";

export default function DisabledRegistrationOnboarding() {
  permanentRedirect("/profile");
}
