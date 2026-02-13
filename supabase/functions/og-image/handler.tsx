import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.4/mod.ts'
import React from 'https://esm.sh/react@18.2.0'

Deno.serve(async (req) => {
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
              width: '1200px',
              height: '630px',
              opacity: 1,
              display: 'flex',
            }}
          />
        )}

        {/* Gradient Overlay for better text readability */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        {/* Content Container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: '60px',
            width: '100%',
            height: '100%',
            zIndex: 10,
          }}
        >
          {/* Logo/Brand */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>📢 Trombone Cidadão</span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 64,
              fontWeight: 900,
              color: '#fff',
              marginBottom: '20px',
              lineHeight: 1.1,
              display: 'flex',
              textAlign: 'left',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            {title}
          </div>

          {/* Stats and CTA Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
               <div style={{ display: 'flex', fontSize: 42, fontWeight: 'bold', color: '#4ade80', marginBottom: '5px' }}>
                {count} apoios
              </div>
              
              {/* Progress Bar */}
              <div
                style={{
                  width: '500px',
                  height: '16px',
                  backgroundColor: 'rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: '#4ade80',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '500px', marginTop: '5px', color: '#ddd', fontSize: 18 }}>
                <span>0</span>
                <span>Meta: {goal}</span>
              </div>
            </div>

            {/* Call to Action */}
            <div
              style={{
                display: 'flex',
                backgroundColor: '#16a34a',
                color: 'white',
                padding: '15px 40px',
                borderRadius: '50px',
                fontSize: 32,
                fontWeight: 'bold',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              }}
            >
              Assine agora!
            </div>
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
