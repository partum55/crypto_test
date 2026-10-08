import { Suspense } from "react";
import ProjectsView from "@/components/ProjectsView";

// ProjectsView reads its search/sort state from the URL (useSearchParams), which needs a Suspense boundary.
export default function Home() {
  return (
    <Suspense>
      <ProjectsView />
    </Suspense>
  );
}
