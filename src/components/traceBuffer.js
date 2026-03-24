// Geodesic buffer polygon for trace lines
export // Geodesic buffer polygon around a polyline — uniform radiusM metres, round caps & joins.
function buildLineBuffer(points, radiusM) {
    if (!points || points.length < 2) return null;
    const EARTH = 6371000, DEG = Math.PI / 180;
    const latOff = (metres) => (metres / EARTH) / DEG;
    const lngOff = (metres, lat) => (metres / (EARTH * Math.cos(lat * DEG))) / DEG;

    function seg([a, b], [c, e]) {
        const dn = (c-a)*EARTH*DEG, de = (e-b)*EARTH*Math.cos((a+c)/2*DEG)*DEG;
        const len = Math.sqrt(dn*dn+de*de)||1;
        return {fwd:[dn/len,de/len], left:[-de/len,dn/len], right:[de/len,-dn/len]};
    }
    function move([lat,lng],[vn,ve],dist) {
        return [lat+latOff(vn*dist), lng+lngOff(ve*dist,lat)];
    }
    function arc(pt, v0, v1, steps) {
        const steps2 = steps || 16;
        const out=[];
        for(let i=0;i<=steps2;i++){
            const t=i/steps2, vn=v0[0]*(1-t)+v1[0]*t, ve=v0[1]*(1-t)+v1[1]*t;
            const l=Math.sqrt(vn*vn+ve*ve)||1;
            out.push(move(pt,[vn/l,ve/l],radiusM));
        }
        return out;
    }

    const n=points.length;
    const segs=[];
    for(let i=0;i<n-1;i++) segs.push(seg(points[i],points[i+1]));

    const leftSide=[], rightSide=[];

    // Start endcap
    leftSide.push(move(points[0], segs[0].left, radiusM));
    rightSide.unshift(move(points[0], segs[0].right, radiusM));
    const startCap = arc(points[0], segs[0].right, segs[0].left, 16);

    // Interior joints
    for(let i=1;i<n-1;i++){
        leftSide.push(...arc(points[i], segs[i-1].left,  segs[i].left,  8));
        rightSide.unshift(...arc(points[i], segs[i-1].right, segs[i].right, 8).reverse());
    }

    // End endcap
    const lastSeg=segs[n-2];
    leftSide.push(move(points[n-1], lastSeg.left, radiusM));
    rightSide.unshift(move(points[n-1], lastSeg.right, radiusM));
    const endCap = arc(points[n-1], lastSeg.left, lastSeg.right, 16);

    return [...leftSide, ...endCap, ...rightSide, ...startCap];
}
