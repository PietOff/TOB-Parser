import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Marker, Popup, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons (Leaflet + bundler issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Simple RD (EPSG:28992) to WGS84 (EPSG:4326) conversion
// Using the standard approximation formula
function rdToWgs84(x, y) {
    const dX = (x - 155000) * 1e-5;
    const dY = (y - 463000) * 1e-5;

    const lat = 52.15517440 +
        (dY * 3235.65389) +
        (dX * -0.24750) +
        (dY * dY * -0.06550) +
        (dX * dY * -0.01847) +
        (dX * dX * -0.00349);

    const lon = 5.38720621 +
        (dX * 5260.52916) +
        (dY * 105.94684) +
        (dX * dY * 2.45656) +
        (dX * dX * -0.81885) +
        (dY * dY * 0.05594) +
        (dX * dX * dY * -0.05607) +
        (dX * dY * dY * 0.01199);

    return [lat / 3600, lon / 3600];
}

// Custom marker for contamination sites
const contaminationIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 24px; height: 24px;
        background: linear-gradient(135deg, #ff4444, #cc0000);
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

const cleanIcon = new L.DivIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 24px; height: 24px;
        background: linear-gradient(135deg, #44cc44, #228822);
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
});

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
 * LocationMap — Interactive map showing TOB locations
 * with PDOK background layers and Bodemkwaliteitskaart WMS overlay
 */
export default function LocationMap({ locations = [], height = '400px' }) {
    const [activeLocation, setActiveLocation] = useState(null);

    // Convert locations to map markers
    const markers = locations
        .filter(loc => {
            // Need either enriched coords or RD coords
            return (loc._enriched?.rdX && loc._enriched?.rdY) ||
                (loc._enriched?.lat && loc._enriched?.lon);
        })
        .map(loc => {
            let lat, lon;
            if (loc._enriched?.lat && loc._enriched?.lon) {
                lat = loc._enriched.lat;
                lon = loc._enriched.lon;
            } else {
                [lat, lon] = rdToWgs84(loc._enriched.rdX, loc._enriched.rdY);
            }
            return {
                ...loc,
                lat, lon,
                isComplex: loc.complex,
            };
        });

    // Default center (Utrecht, Netherlands)
    const defaultCenter = [52.0907, 5.1214];
    const center = markers.length > 0
        ? [markers[0].lat, markers[0].lon]
        : defaultCenter;
    const positions = markers.map(m => [m.lat, m.lon]);

    if (markers.length === 0) {
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
                    <div>Geen coördinaten beschikbaar</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een bestand met adresgegevens</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{
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

                    {/* Overlay layers */}
                    <LayersControl.Overlay checked name="🔴 Bodemkwaliteitskaart">
                        <WMSTileLayer
                            url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0"
                            layers="bodemkwaliteitskaart"
                            format="image/png"
                            transparent={true}
                            opacity={0.5}
                            attribution='&copy; PDOK Bodemkwaliteit'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="📐 Kadastrale grenzen">
                        <WMSTileLayer
                            url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0"
                            layers="Perceel"
                            format="image/png"
                            transparent={true}
                            opacity={0.4}
                            attribution='&copy; Kadaster'
                        />
                    </LayersControl.Overlay>
                </LayersControl>

                {/* Location markers */}
                {markers.map((marker, idx) => (
                    <Marker
                        key={marker.locatiecode || idx}
                        position={[marker.lat, marker.lon]}
                        icon={marker.isComplex ? contaminationIcon : cleanIcon}
                        eventHandlers={{
                            click: () => setActiveLocation(marker),
                        }}
                    >
                        <Popup maxWidth={300}>
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>
                                <div style={{
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    borderBottom: '1px solid #eee',
                                    paddingBottom: '4px',
                                    marginBottom: '6px',
                                    color: marker.isComplex ? '#cc0000' : '#228822',
                                }}>
                                    {marker.isComplex ? '⚠️' : '✅'} {marker.locatiecode}
                                </div>
                                <div><b>Naam:</b> {marker.locatienaam || '—'}</div>
                                <div><b>Adres:</b> {`${marker.straatnaam || ''} ${marker.huisnummer || ''}`.trim() || '—'}</div>
                                {marker._enriched?.gemeente && (
                                    <div><b>Gemeente:</b> {marker._enriched.gemeente}</div>
                                )}
                                {marker._enriched?.bodemkwaliteit?.[0] && (
                                    <div><b>Bodemklasse:</b> {marker._enriched.bodemkwaliteit[0].klasse}</div>
                                )}
                                <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {marker._enriched?.topotijdreisHuidig && (
                                        <a href={marker._enriched.topotijdreisHuidig} target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: '12px', color: '#1a73e8' }}>
                                            🕰️ Topotijdreis
                                        </a>
                                    )}
                                    {marker._enriched?.bodemloket && (
                                        <a href={marker._enriched.bodemloket} target="_blank" rel="noopener noreferrer"
                                            style={{ fontSize: '12px', color: '#1a73e8' }}>
                                            🔍 Bodemloket
                                        </a>
                                    )}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Map legend overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.75)',
                color: 'white',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                display: 'flex',
                gap: '12px',
            }}>
                <span>🔴 Complex</span>
                <span>🟢 Onverdacht</span>
                <span style={{ opacity: 0.7 }}>Kaartlaag = Bodemkwaliteitszone</span>
            </div>
        </div>
    );
}
