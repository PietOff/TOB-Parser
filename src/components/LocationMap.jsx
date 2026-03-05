import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Polyline, LayersControl, useMap, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { rdToWgs84 } from '../utils/apiIntegrations';

// Component to auto-fit map bounds
function FitBounds({ positions }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length > 0) {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [positions, map]);
    return null;
}

/**
 * LocationMap — Interactive map showing TOB project traces
 * with PDOK background layers, cadastral parcels, and manual drawing tools
 */
export default function LocationMap({ locations = [], height = '400px', onLocationDrag, highlightedLocationCode }) {
    const [drawingMode, setDrawingMode] = useState(false);
    const [drawnTraces, setDrawnTraces] = useState([]);

    console.log(`🗺️ [Map] Received ${locations.length} locations.`);

    // Merge all trace geometries from all locations
    const allTracePoints = [];
    const uniqueTraces = new Set();

    for (const loc of locations) {
        if (loc.traceGeometry && Array.isArray(loc.traceGeometry) && loc.traceGeometry.length > 0) {
            for (const point of loc.traceGeometry) {
                const key = `${point[0]},${point[1]}`;
                if (!uniqueTraces.has(key)) {
                    uniqueTraces.add(key);
                    allTracePoints.push(point);
                }
            }
        }
    }

    // Get center and bounds
    const defaultCenter = [52.0907, 5.1214];
    let center = defaultCenter;
    const positions = allTracePoints.length > 0 ? allTracePoints : defaultCenter;

    if (allTracePoints.length > 0) {
        const latitudes = allTracePoints.map(p => p[0]);
        const longitudes = allTracePoints.map(p => p[1]);
        center = [
            (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
            (Math.min(...longitudes) + Math.max(...longitudes)) / 2
        ];
    }

    if (!allTracePoints || allTracePoints.length === 0) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Geen projecttracé gevonden in documenten</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Je kunt de tracé hieronder handmatig tekenen</div>
                </div>
            </div>
        );
    }

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
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <FitBounds positions={positions} />

                <LayersControl position="topright">
                    {/* Base layers */}
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            crossOrigin="anonymous"
                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK Luchtfoto">
                        <TileLayer
                            crossOrigin="anonymous"
                            attribution='&copy; PDOK'
                            url="https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK BRT Achtergrond">
                        <TileLayer
                            crossOrigin="anonymous"
                            attribution='&copy; Kadaster / PDOK'
                            url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    {/* Overlay layers */}
                    <LayersControl.Overlay checked name="🔴 Bodemkwaliteitskaart">
                        <WMSTileLayer
                            crossOrigin="anonymous"
                            url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0"
                            layers="bodemkwaliteitskaart"
                            format="image/png"
                            transparent={true}
                            opacity={0.5}
                            attribution='&copy; PDOK Bodemkwaliteit'
                            params={{ crossOrigin: 'anonymous' }}
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay checked name="📐 Kadastrale Percelen (BRK)">
                        <WMSTileLayer
                            crossOrigin="anonymous"
                            url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0"
                            layers="Perceel"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; Kadaster'
                            params={{ crossOrigin: 'anonymous' }}
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="🏠 Gebouwcontouren (BAG)">
                        <WMSTileLayer
                            crossOrigin="anonymous"
                            url="https://service.pdok.nl/lvbag/bag/wms/v2_0"
                            layers="pand"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; BAG'
                            params={{ crossOrigin: 'anonymous' }}
                        />
                    </LayersControl.Overlay>
                </LayersControl>

                {/* Display extracted trace as polyline */}
                {allTracePoints.length > 0 && (
                    <Polyline
                        positions={allTracePoints}
                        color="#1976d2"
                        weight={4}
                        opacity={0.8}
                        dashArray="5, 5"
                    >
                    </Polyline>
                )}

                {/* Drawing tools for manual trace creation */}
                <FeatureGroup>
                    <EditControl
                        position="topleft"
                        onCreated={(e) => {
                            const layer = e.layer;
                            if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
                                const coords = layer.getLatLngs();
                                setDrawnTraces([...drawnTraces, coords]);
                                console.log('✏️ Handmatig getekende tracé:', coords);
                            }
                        }}
                        onEdited={(e) => {
                            console.log('✏️ Tracé bewerkt');
                        }}
                        onDeleted={() => {
                            console.log('✏️ Tracé verwijderd');
                        }}
                        draw={{
                            polyline: true,
                            polygon: true,
                            rectangle: true,
                            circle: false,
                            circlemarker: false,
                            marker: false,
                        }}
                    />
                </FeatureGroup>

                {/* Display manually drawn traces */}
                {drawnTraces.map((trace, idx) => (
                    <Polyline
                        key={`drawn-${idx}`}
                        positions={trace}
                        color="#ff6b6b"
                        weight={3}
                        opacity={0.7}
                    />
                ))}
            </MapContainer>

            {/* Map legend overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '11px',
            }}>
                <div style={{ marginBottom: '6px', fontWeight: 'bold' }}>Tracé Legend:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span><span style={{ color: '#1976d2', fontSize: '16px' }}>—</span> Geëxtraheerde tracé</span>
                    <span><span style={{ color: '#ff6b6b', fontSize: '16px' }}>—</span> Handmatig getekend</span>
                    <span style={{ marginTop: '6px', fontSize: '10px', opacity: 0.8 }}>Tip: Zet 'Kadastrale Percelen' aan voor perceelcontouren</span>
                </div>
            </div>
        </div>
    );
}
