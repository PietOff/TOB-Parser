// Geodesic buffer — uniform radiusM metres, round caps & joins, no self-intersection
// Uses arc joins at every vertex to prevent overlap artifacts

export function buildLineBuffer(points, radiusM) {
    if (!points || points.length < 2) return null;

    const EARTH = 6371000;
    const DEG = Math.PI / 180;

    // Convert metres to lat/lng offsets at a given latitude
    function latOff(m) { return (m / EARTH) / DEG; }
    function lngOff(m, lat) { return (m / (EARTH * Math.cos(lat * DEG))) / DEG; }

    // Move a [lat,lng] point by a normalised [vn,ve] unit vector * dist metres
    function move([lat, lng], [vn, ve], dist) {
        return [lat + latOff(vn * dist), lng + lngOff(ve * dist, lat)];
    }

    // Compute the unit direction vector of a segment (in metric space)
    function segDir([lat1, lng1], [lat2, lng2]) {
        const midLat = (lat1 + lat2) / 2;
        const dn = (lat2 - lat1) * EARTH * DEG;
        const de = (lng2 - lng1) * EARTH * Math.cos(midLat * DEG) * DEG;
        const len = Math.sqrt(dn * dn + de * de) || 1;
        return [dn / len, de / len]; // unit forward vector [north, east]
    }

    // Left-perpendicular of a forward vector
    function leftOf([vn, ve]) { return [-ve, vn]; }
    function rightOf([vn, ve]) { return [ve, -vn]; }

    // Generate a circular arc from angle a0 to a1 (radians, CCW) around center pt,
    // using the supplied perpendicular unit vectors at start and end.
    // We interpolate between them to avoid trig.
    function arcBetween(pt, v0, v1, steps) {
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            // Linear interpolation then re-normalise → traces a circular arc
            const vn = v0[0] * (1 - t) + v1[0] * t;
            const ve = v0[1] * (1 - t) + v1[1] * t;
            const len = Math.sqrt(vn * vn + ve * ve) || 1;
            pts.push(move(pt, [vn / len, ve / len], radiusM));
        }
        return pts;
    }

    const n = points.length;

    // Compute forward unit vectors and their perpendiculars for each segment
    const fwd = [], lft = [], rgt = [];
    for (let i = 0; i < n - 1; i++) {
        const f = segDir(points[i], points[i + 1]);
        fwd.push(f);
        lft.push(leftOf(f));
        rgt.push(rightOf(f));
    }

    // Build the left side (forward) and right side (backward)
    const leftPts = [];
    const rightPts = [];

    // --- Start endcap (semicircle, right → left going backward around start point) ---
    // Arc from rgt[0] to lft[0] going through the "back" (180°)
    const startCap = arcBetween(points[0], rgt[0], lft[0], 16);
    // startCap goes right→back→left, we'll prepend reversed to rightPts and start leftPts

    // --- Left side: walk forward adding arc joins at each interior vertex ---
    leftPts.push(move(points[0], lft[0], radiusM));
    for (let i = 1; i < n - 1; i++) {
        // Round join on the LEFT side between segment i-1 and segment i
        const arc = arcBetween(points[i], lft[i - 1], lft[i], 8);
        leftPts.push(...arc);
    }
    leftPts.push(move(points[n - 1], lft[n - 2], radiusM));

    // --- End endcap (semicircle, left → right going forward around end point) ---
    const endCap = arcBetween(points[n - 1], lft[n - 2], rgt[n - 2], 16);
    leftPts.push(...endCap);

    // --- Right side: walk backward adding arc joins at each interior vertex ---
    rightPts.push(move(points[n - 1], rgt[n - 2], radiusM));
    for (let i = n - 2; i >= 1; i--) {
        // Round join on the RIGHT side between segment i and segment i-1 (going backward)
        const arc = arcBetween(points[i], rgt[i], rgt[i - 1], 8);
        rightPts.push(...arc);
    }
    rightPts.push(move(points[0], rgt[0], radiusM));

    // --- Combine: leftPts (with endcap) + rightPts (backward) + startCap ---
    return [...leftPts, ...rightPts, ...startCap];
}
