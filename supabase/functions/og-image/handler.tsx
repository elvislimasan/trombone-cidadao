import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.4/mod.ts'
import React from 'https://esm.sh/react@18.2.0'

serve(async (req) => {
  const url = new URL(req.url)
  const title = url.searchParams.get('title') || 'Trombone Cidadão'
  const count = url.searchParams.get('count') || '0'
  const imageUrl = url.searchParams.get('image')
  const goal = url.searchParams.get('goal') || '100'

  // Calculate percentage
  const percentage = Math.min(100, Math.round((parseInt(count) / parseInt(goal)) * 100))

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Background Image */}
        {imageUrl && (
          <img
            src={imageUrl}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.4,
            }}
          />
        )}

        {/* Content Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '40px 60px',
            borderRadius: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
            maxWidth: '90%',
            textAlign: 'center',
            zIndex: 10,
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          {/* Logo/Brand */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: 24, fontWeight: 'bold', color: '#666' }}>📢 Trombone Cidadão</span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 60,
              fontWeight: 900,
              color: '#111',
              marginBottom: '20px',
              lineHeight: 1.1,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {title}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div style={{ fontSize: 48, fontWeight: 'bold', color: '#16a34a', marginBottom: '10px' }}>
              {count} apoios
            </div>
            
            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '20px',
                backgroundColor: '#e5e7eb',
                borderRadius: '10px',
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: '100%',
                  backgroundColor: '#16a34a',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '5px', color: '#666', fontSize: 20 }}>
              <span>0</span>
              <span>Meta: {goal}</span>
            </div>
          </div>

          {/* Call to Action */}
          <div
            style={{
              marginTop: '30px',
              backgroundColor: '#16a34a',
              color: 'white',
              padding: '10px 30px',
              borderRadius: '50px',
              fontSize: 28,
              fontWeight: 'bold',
            }}
          >
            Assine e cobre solução!
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  )
})
