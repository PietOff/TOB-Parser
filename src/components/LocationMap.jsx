import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker, Popup, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { rdToWgs84 } from '../utils/apiIntegrations';

// Component to auto-fit map bounds to all locations
function FitBounds({ locations, center, radius }) {
    const map = useMap();
    useEffect(() => {
        const validCoords = (locations || [])
            .map(loc => {
                const lat = loc._enriched?.lat ?? null;
                const lon = loc._enriched?.lon ?? null;
                if (lat && lon && !isNaN(lat) && !isNaN(lon)) return [lat, lon];
                if (loc._enriched?.rd?.x && loc._enriched?.rd?.y) {
                    const wgs = rdToWgs84(loc._enriched.rd.x, loc._enriched.rd.y);
                    if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) return [wgs.lat, wgs.lng];
                }
                return null;
            })
            .filter(Boolean);

        if (validCoords.length > 1) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } else if (validCoords.length === 1) {
            map.setView(validCoords[0], 15);
        } else if (center && Array.isArray(center) && !isNaN(center[0]) && !isNaN(center[1])) {
            const parsedRadius = parseFloat(radius);
            if (!isNaN(parsedRadius) && parsedRadius > 0) {
                const radiusKm = parsedRadius / 1000;
                const bounds = L.latLngBounds(
                    [center[0] - radiusKm / 111, center[1] - radiusKm / 111],
                    [center[0] + radiusKm / 111, center[1] + radiusKm / 111]
                );
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            } else {
                map.setView(center, 14);
            }
        }
    }, [locations, center, radius, map]);
    return null;
}

// Fly to a specific location when the highlighted code changes
function FlyToLocation({ locations, highlightedCode }) {
    const map = useMap();
    const prevCode = useRef(null);

    useEffect(() => {
        if (!highlightedCode || highlightedCode === prevCode.current) return;
        prevCode.current = highlightedCode;

        const loc = locations.find(l => l.locatiecode === highlightedCode);
        if (!loc) return;

        let lat = loc._enriched?.lat;
        let lon = loc._enriched?.lon;

        if ((!lat || !lon) && loc._enriched?.rd?.x && loc._enriched?.rd?.y) {
            const wgs = rdToWgs84(loc._enriched.rd.x, loc._enriched.rd.y);
            if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) { lat = wgs.lat; lon = wgs.lng; }
        }

        lat = parseFloat(lat);
        lon = parseFloat(lon);

        if (!isNaN(lat) && !isNaN(lon)) {
            map.flyTo([lat, lon], 17, { animate: true, duration: 0.8 });
        }
    }, [highlightedCode, locations, map]);

    return null;
}

/**
 * LocationMap — Interactive map showing project trace area and location markers
 */
export default function LocationMap({
    locations = [],
    height = '400px',
    highlightedLocationCode,
    projectAddress,
    projectTrace
}) {
    const [mapCenter, setMapCenter] = useState(null);
    const [bufferRadius, setBufferRadius] = useState(500);
    const [isLoading, setIsLoading] = useState(true);

    // Compute location markers with WGS84 coordinates
    const locationMarkers = useMemo(() => {
        return locations
            .map(loc => {
                let lat = loc._enriched?.lat;
                let lon = loc._enriched?.lon;

                if ((!lat || !lon) && loc._enriched?.rd?.x && loc._enriched?.rd?.y) {
                    const wgs = rdToWgs84(loc._enriched.rd.x, loc._enriched.rd.y);
                    if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) {
                        lat = wgs.lat;
                        lon = wgs.lng;
                    }
                }

                lat = parseFloat(lat);
                lon = parseFloat(lon);

                if (isNaN(lat) || isNaN(lon)) return null;

                return { ...loc, _lat: lat, _lon: lon };
            })
            .filter(Boolean);
    }, [locations]);

    // Geocode the project address to get map center
    useEffect(() => {
        let cancelled = false;

        async function geocodeAddress() {
            if (locationMarkers.length > 0) {
                const avgLat = locationMarkers.reduce((s, m) => s + m._lat, 0) / locationMarkers.length;
                const avgLon = locationMarkers.reduce((s, m) => s + m._lon, 0) / locationMarkers.length;
                if (!cancelled) {
                    if (!isNaN(avgLat) && !isNaN(avgLon)) {
                        setMapCenter([avgLat, avgLon]);
                    }
                    if (projectTrace?.distance) {
                        const radiusM = projectTrace.unit === 'km'
                            ? projectTrace.distance * 1000
                            : projectTrace.distance;
                        if (!isNaN(radiusM) && radiusM > 0) setBufferRadius(radiusM);
                    }
                    setIsLoading(false);
                }
                return;
            }

            if (!projectAddress) {
                if (!cancelled) setIsLoading(false);
                return;
            }

            try {
                const query = `${projectAddress.straatnaam} ${projectAddress.huisnummer}, ${projectAddress.postcode || projectAddress.city}, Netherlands`;
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
                );
                const results = await response.json();

                if (!cancelled && results.length > 0) {
                    const first = results[0];
                    const c = [parseFloat(first.lat), parseFloat(first.lon)];
                    if (!isNaN(c[0]) && !isNaN(c[1])) setMapCenter(c);

                    if (projectTrace?.distance) {
                        const radiusM = projectTrace.unit === 'km'
                            ? projectTrace.distance * 1000
                            : projectTrace.distance;
                        if (!isNaN(radiusM) && radiusM > 0) setBufferRadius(radiusM);
                    }
                }
            } catch (err) {
                console.warn('Geocoding failed:', err);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        geocodeAddress();
        return () => { cancelled = true; };
    }, [projectAddress, projectTrace, locationMarkers]);

    const defaultCenter = [52.0907, 5.1214];
    const center = mapCenter || defaultCenter;
    const hasValidCenter = !!mapCenter;

    if (isLoading) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Kaart laden...</div>
                </div>
            </div>
        );
    }

    if (!hasValidCenter && locationMarkers.length === 0 && !projectAddress) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Geen projectlocatie gevonden</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een TOB document met adresgegevens</div>
                </div>
            </div>
        );
    }

    const safeBufferRadius = (typeof bufferRadius === 'number' && !isNaN(bufferRadius) && bufferRadius > 0)
        ? bufferRadius : 500;

    return (
        <div id="master-location-map" style={{
            height,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            position: 'relative',
        }}>
            <MapContainer
                center={center}
                zoom={!hasValidCenter ? 8 : 14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <FitBounds locations={locations} center={center} radius={safeBufferRadius} />
                <FlyToLocation locations={locationMarkers} highlightedCode={highlightedLocationCode} />

                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK Luchtfoto">
                        <TileLayer
                            attribution='&copy; PDOK'
                            url="https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK BRT Achtergrond">
                        <TileLayer
                            attribution='&copy; Kadaster / PDOK'
                            url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.Overlay name="Bodemkwaliteitskaart">
                        <WMSTileLayer
                            url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0"
                            layers="bodemkwaliteitskaart"
                            format="image/png"
                            transparent={true}
                            opacity={0.5}
                            attribution='&copy; PDOK Bodemkwaliteit'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay checked name="Kadastrale Percelen (BRK)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0"
                            layers="Perceel"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; Kadaster'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="Gebouwcontouren (BAG)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/lvbag/bag/wms/v2_0"
                            layers="pand"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; BAG'
                        />
                    </LayersControl.Overlay>
                </LayersControl>

                {/* Project area buffer circle */}
                {hasValidCenter && (
                    <Circle
                        center={mapCenter}
                        radius={safeBufferRadius}
                        pathOptions={{
                            color: '#1976d2',
                            weight: 3,
                            opacity: 0.6,
                            fillColor: '#1976d2',
                            fillOpacity: 0.1,
                            dashArray: '5, 5',
                        }}
                    />
                )}

                {/* Individual location markers */}
                {locationMarkers.map(loc => {
                    const isHighlighted = highlightedLocationCode === loc.locatiecode;
                    const isComplex = loc.complex;
                    const color = isComplex ? '#ef4444' : '#22c55e';

                    return (
                        <CircleMarker
                            key={loc.locatiecode}
                            center={[loc._lat, loc._lon]}
                            radius={isHighlighted ? 10 : 7}
                            pathOptions={{
                                color: isHighlighted ? '#fff' : color,
                                weight: isHighlighted ? 3 : 2,
                                fillColor: color,
                                fillOpacity: 0.8,
                            }}
                        >
                            <Popup>
                                <div style={{ fontSize: '12px', minWidth: '150px' }}>
                                    <strong>{loc.locatiecode}</strong>
                                    {loc.locatienaam && <div>{loc.locatienaam}</div>}
                                    {loc.straatnaam && <div>{loc.straatnaam} {loc.huisnummer}</div>}
                                    {loc.conclusie && (
                                        <div style={{ marginTop: '4px', color: isComplex ? '#ef4444' : '#22c55e' }}>
                                            {loc.conclusie}
                                        </div>
                                    )}
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* Map legend and info overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                maxWidth: '300px',
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    📍 {locationMarkers.length} locatie(s) op kaart
                </div>
                {projectAddress && (
                    <div style={{ marginBottom: '6px', fontSize: '11px' }}>
                        <div><strong>{projectAddress.straatnaam} {projectAddress.huisnummer}</strong></div>
                        <div>{projectAddress.postcode} {projectAddress.city}</div>
                    </div>
                )}
                {projectTrace && (
                    <div style={{ marginBottom: '6px', fontSize: '11px', borderTop: '1px solid #555', paddingTop: '6px' }}>
                        <div style={{ color: '#4da6ff' }}>Auto-gedetecteerd</div>
                        <div><strong>Tracé:</strong> {projectTrace.description}</div>
                        {projectTrace.distance && (
                            <div>Buffer: {projectTrace.distance} {projectTrace.unit}</div>
                        )}
                    </div>
                )}
                <div style={{ fontSize: '10px', opacity: 0.8, borderTop: '1px solid #555', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ color: '#22c55e' }}>●</span> Onverdacht &nbsp;
                    <span style={{ color: '#ef4444' }}>●</span> Complex/Verdacht
                </div>
            </div>
        </div>
    );
}
