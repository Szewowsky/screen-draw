import { HomeView } from "./home-view";

export function RootView() {
  return (
    <div className="relative h-full">
      <div className="drag-region fixed top-0 left-0 right-0 h-13" />
      <HomeView />
    </div>
  );
}
