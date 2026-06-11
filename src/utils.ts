/**
 * Grocery AI Agent - Helper Utilities
 */

/**
 * Formats a number as Thai Baht currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats an ISO timestamp to localized Thai date-time
 */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Generates an SVG string representation of a realistic Thai PromptPay QR Code
 * containing merchant identifier context and specific transaction total.
 */
export function generatePromptPayQrSvg(amount: number, merchantId = '082-123-4567'): { svgPath: string; payload: string } {
  // Pad total to spec if needed
  const amountStr = amount.toFixed(2);
  const payData = `00020101021129370016A000000677010111011300${merchantId.replace(/-/g, '')}5410${amountStr.length.toString().padStart(2, '0')}${amountStr}5802TH5303764`;
  
  // Generating a deterministic grid of mock QR code blocks from seed (payload hash)
  let hash = 0;
  for (let i = 0; i < payData.length; i++) {
    hash = (hash << 5) - hash + payData.charCodeAt(i);
    hash |= 0;
  }
  
  // A standard 25x25 QR grid
  const size = 25;
  const blocks: string[] = [];
  
  // High fidelity finder patterns
  const drawFinder = (xStart: number, yStart: number) => {
    // Outer 7x7 square
    for (let x = 0; x < 7; x++) {
      for (let y = 0; y < 7; y++) {
        const isBorder = x === 0 || x === 6 || y === 0 || y === 6;
        const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (isBorder || isCenter) {
          blocks[`${xStart + x},${yStart + y}`] = 'filled';
        } else {
          blocks[`${xStart + x},${yStart + y}`] = 'empty';
        }
      }
    }
  };

  // 1. Draw top-left, top-right, bottom-left finders
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  // 2. Draw alignment pattern (5x5) at size-9, size-9
  const ax = size - 9;
  const ay = size - 9;
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const isBorder = x === 0 || x === 4 || y === 0 || y === 4;
      const isCenter = x === 2 && y === 2;
      if (isBorder || isCenter) {
        blocks[`${ax + x},${ay + y}`] = 'filled';
      } else {
        blocks[`${ax + x},${ay + y}`] = 'empty';
      }
    }
  }

  // 3. Sync/fill remaining blocks deterministically based on payload hash
  let count = hash;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      if (blocks[key] === undefined) {
        // Pseudo-random bit using XORshift logic
        count ^= count << 13;
        count ^= count >> 17;
        count ^= count << 5;
        const fill = (count & 7) > 3;
        blocks[key] = fill ? 'filled' : 'empty';
      }
    }
  }

  // Convert blocks to SVG path data blocks
  let pathBuilder = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (blocks[`${x},${y}`] === 'filled') {
        pathBuilder += `M${x},${y} h1 v1 h-1 z `;
      }
    }
  }

  return {
    svgPath: pathBuilder,
    payload: payData,
  };
}
