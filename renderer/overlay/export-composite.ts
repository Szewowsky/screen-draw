export interface ExportImageSize {
  width: number;
  height: number;
}

export interface ExportDisplaySize {
  width: number;
  height: number;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function resolveExportScale(
  image: ExportImageSize,
  display: ExportDisplaySize,
): { scaleX: number; scaleY: number } {
  if (
    !positiveFinite(image.width) ||
    !positiveFinite(image.height) ||
    !positiveFinite(display.width) ||
    !positiveFinite(display.height)
  ) {
    throw new Error("Export image and display sizes must be positive finite numbers");
  }

  return {
    scaleX: image.width / display.width,
    scaleY: image.height / display.height,
  };
}
