import SoftwareApp from "./software/SoftwareApp";
import WebDemoApp from "./WebDemoApp";

const softwareSurface =
  import.meta.env.VITE_DAYMARK_SURFACE === "software";

export default function App() {
  return softwareSurface ? <SoftwareApp /> : <WebDemoApp />;
}
