const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addDriverDocumentAccessUrl,
  addInspectionPhotoAccessUrls,
  createSignedStorageUrl,
  parseStorageReference
} = require('./privateStorage');

function createStorageMock() {
  return {
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, expiresIn) {
            return {
              data: { signedUrl: `https://storage.test/${bucket}/${path}?expires=${expiresIn}` },
              error: null
            };
          }
        };
      }
    }
  };
}

test('parseStorageReference extracts private paths from legacy public and signed URLs', () => {
  assert.deepEqual(
    parseStorageReference('https://project.supabase.co/storage/v1/object/public/pod-photos/acct/stop.jpg'),
    { bucket: 'pod-photos', path: 'acct/stop.jpg' }
  );
  assert.deepEqual(
    parseStorageReference('https://project.supabase.co/storage/v1/object/sign/vehicle-inspection-photos/acct/photo.jpg?token=old'),
    { bucket: 'vehicle-inspection-photos', path: 'acct/photo.jpg' }
  );
});

test('createSignedStorageUrl refuses unknown buckets', async () => {
  const signedUrl = await createSignedStorageUrl(createStorageMock(), {
    bucket: 'public-marketing-assets',
    path: 'logo.png'
  });

  assert.equal(signedUrl, null);
});

test('addDriverDocumentAccessUrl removes the public URL and returns temporary access', async () => {
  const document = await addDriverDocumentAccessUrl(createStorageMock(), {
    id: 'doc-1',
    file_name: 'license.pdf',
    storage_bucket: 'driver-documents',
    storage_path: 'acct/driver/license.pdf',
    public_url: 'https://public.example/license.pdf'
  });

  assert.equal(document.public_url, null);
  assert.match(document.access_url, /^https:\/\/storage\.test\/driver-documents\//);
  assert.equal(document.access_url_expires_in, 900);
});

test('addInspectionPhotoAccessUrls replaces stored public URLs with signed URLs', async () => {
  const inspection = await addInspectionPhotoAccessUrls(createStorageMock(), {
    items: [{
      checklist_item_key: 'tires',
      photos: [{
        storage_bucket: 'vehicle-inspection-photos',
        storage_path: 'acct/vehicle/tires.jpg',
        url: 'https://public.example/tires.jpg'
      }]
    }],
    issue_items: [{ checklist_item_key: 'tires', photos: [] }]
  });

  assert.match(inspection.items[0].photos[0].url, /^https:\/\/storage\.test\/vehicle-inspection-photos\//);
  assert.equal(inspection.issue_items[0].photos[0].storage_path, 'acct/vehicle/tires.jpg');
});
