export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <img src="/image.png" alt="SoCal Autoworks" className="h-16 mx-auto mb-4 animate-pulse" />
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}
